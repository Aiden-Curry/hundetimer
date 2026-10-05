-- MVP v3 availability upgrade
-- Run this once in Supabase SQL Editor if you already ran the v2 schema.

-- Safe upgrades when this file is re-run on an existing MVP database.
alter table public.services add column if not exists slot_interval_minutes int not null default 30;
alter table public.availability_exceptions add column if not exists service_id uuid references public.services(id) on delete cascade;
alter table public.availability_slots drop constraint if exists availability_slots_trainer_id_starts_at_key;
create unique index if not exists availability_slots_service_start_uidx
  on public.availability_slots(service_id, starts_at);

-- Rebuild future OPEN slots for one service from the trainer's recurring weekly hours.
-- The function is SECURITY INVOKER, so normal RLS still applies to every table it touches.
create or replace function public.regenerate_service_slots(
  p_service_id uuid,
  p_days integer default 60
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_duration integer;
  v_interval integer;
  v_inserted integer := 0;
begin
  select s.trainer_id, s.duration_minutes, greatest(15, s.slot_interval_minutes)
    into v_trainer_id, v_duration, v_interval
  from public.services s
  where s.id = p_service_id
    and s.trainer_id = (select auth.uid())
    and s.active = true;

  if v_trainer_id is null then
    raise exception 'Tjenesten finnes ikke, er inaktiv eller tilhører ikke brukeren.';
  end if;

  p_days := greatest(1, least(coalesce(p_days, 60), 120));

  delete from public.availability_slots sl
  where sl.trainer_id = v_trainer_id
    and sl.service_id = p_service_id
    and sl.status = 'open'
    and sl.starts_at >= now();

  with local_days as (
    select gs::date as local_day
    from generate_series(
      (now() at time zone 'Europe/Oslo')::date,
      (now() at time zone 'Europe/Oslo')::date + p_days,
      interval '1 day'
    ) gs
  ),
  recurring_candidates as (
    select
      wa.trainer_id,
      wa.service_id,
      candidate_start as starts_at,
      candidate_start + make_interval(mins => v_duration) as ends_at
    from public.weekly_availability wa
    join local_days d
      on extract(dow from d.local_day)::smallint = wa.weekday
    cross join lateral generate_series(
      ((d.local_day + wa.start_time) at time zone wa.timezone),
      ((d.local_day + wa.end_time) at time zone wa.timezone) - make_interval(mins => v_duration),
      make_interval(mins => v_interval)
    ) candidate_start
    where wa.trainer_id = v_trainer_id
      and wa.service_id = p_service_id
      and wa.active = true
  ),
  filtered as (
    select c.*
    from recurring_candidates c
    where c.starts_at > now()
      and not exists (
        select 1
        from public.availability_exceptions e
        where e.trainer_id = v_trainer_id
          and (e.service_id is null or e.service_id = p_service_id)
          and e.kind = 'blocked'
          and c.starts_at < e.ends_at
          and c.ends_at > e.starts_at
      )
      and not exists (
        select 1
        from public.availability_slots existing
        where existing.trainer_id = v_trainer_id
          and existing.status in ('held','booked','blocked')
          and c.starts_at < existing.ends_at
          and c.ends_at > existing.starts_at
      )
  )
  insert into public.availability_slots (trainer_id, service_id, starts_at, ends_at, status)
  select trainer_id, service_id, starts_at, ends_at, 'open'
  from filtered
  on conflict (service_id, starts_at) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Add a full-day block in Europe/Oslo without making the browser calculate DST offsets.
create or replace function public.block_service_day(
  p_service_id uuid,
  p_date date,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_id uuid;
begin
  select s.trainer_id into v_trainer_id
  from public.services s
  where s.id = p_service_id
    and s.trainer_id = (select auth.uid());

  if v_trainer_id is null then
    raise exception 'Tjenesten finnes ikke eller tilhører ikke brukeren.';
  end if;

  insert into public.availability_exceptions (
    trainer_id, service_id, starts_at, ends_at, kind, note
  ) values (
    v_trainer_id,
    p_service_id,
    (p_date::timestamp at time zone 'Europe/Oslo'),
    ((p_date + 1)::timestamp at time zone 'Europe/Oslo'),
    'blocked',
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.regenerate_service_slots(uuid, integer) from public, anon;
revoke execute on function public.block_service_day(uuid, date, text) from public, anon;
grant execute on function public.regenerate_service_slots(uuid, integer) to authenticated;
grant execute on function public.block_service_day(uuid, date, text) to authenticated;
