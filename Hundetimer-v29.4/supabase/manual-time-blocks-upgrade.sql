-- MVP v21.1 manual time blocks
-- Run after the v21 calendar integration upgrade.
-- Adds one-off full-day or partial-day availability blocks without changing the existing table schema.

create or replace function public.block_trainer_period(
  p_service_id uuid,
  p_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trainer_id uuid := (select auth.uid());
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
begin
  if v_trainer_id is null then
    raise exception 'Du må være logget inn.';
  end if;

  if p_date is null then
    raise exception 'Velg en dato.';
  end if;

  if p_service_id is not null and not exists (
    select 1
    from public.services s
    where s.id = p_service_id
      and s.trainer_id = v_trainer_id
  ) then
    raise exception 'Tjenesten finnes ikke eller tilhører ikke brukeren.';
  end if;

  if (p_start_time is null) <> (p_end_time is null) then
    raise exception 'Både start- og sluttid må fylles ut.';
  end if;

  if p_start_time is null then
    v_start := (p_date::timestamp at time zone 'Europe/Oslo');
    v_end := ((p_date + 1)::timestamp at time zone 'Europe/Oslo');
  else
    if p_end_time <= p_start_time then
      raise exception 'Sluttiden må være etter starttiden.';
    end if;
    v_start := ((p_date + p_start_time) at time zone 'Europe/Oslo');
    v_end := ((p_date + p_end_time) at time zone 'Europe/Oslo');
  end if;

  if v_end <= now() then
    raise exception 'Tidsrommet må være i fremtiden.';
  end if;

  -- Never let a manual block silently cover an appointment that a customer is
  -- already holding or has booked. A global block checks every service, while a
  -- service-specific block only checks that service.
  if exists (
    select 1
    from public.availability_slots sl
    where sl.trainer_id = v_trainer_id
      and sl.status in ('held', 'booked')
      and (p_service_id is null or sl.service_id = p_service_id)
      and sl.starts_at < v_end
      and sl.ends_at > v_start
  ) then
    raise exception 'Det finnes allerede en reservert eller bekreftet bestilling i dette tidsrommet.';
  end if;

  insert into public.availability_exceptions (
    trainer_id,
    service_id,
    starts_at,
    ends_at,
    kind,
    note
  ) values (
    v_trainer_id,
    p_service_id,
    v_start,
    v_end,
    'blocked',
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.block_trainer_period(uuid, date, time without time zone, time without time zone, text) from public, anon;
grant execute on function public.block_trainer_period(uuid, date, time without time zone, time without time zone, text) to authenticated;
