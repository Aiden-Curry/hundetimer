-- MVP v20: finance, payout controls, statements and reconciliation support
-- Run once after the v19 waitlist migration.

-- Admin-only controls are kept separate from trainer-editable bank details.
create table if not exists public.trainer_payout_controls (
  trainer_id uuid primary key references public.trainer_profiles(id) on delete cascade,
  payout_hold boolean not null default false,
  hold_reason text,
  admin_note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.trainer_payout_controls enable row level security;
drop policy if exists "trainer_payout_controls_admin_read" on public.trainer_payout_controls;
drop policy if exists "trainer_payout_controls_trainer_read" on public.trainer_payout_controls;
create policy "trainer_payout_controls_trainer_read" on public.trainer_payout_controls
  for select to authenticated using (trainer_id = auth.uid());
create policy "trainer_payout_controls_admin_read" on public.trainer_payout_controls
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

alter table public.payout_batches add column if not exists period_start date;
alter table public.payout_batches add column if not exists period_end date;
alter table public.payout_batches add column if not exists exported_at timestamptz;
alter table public.payout_batches add column if not exists admin_note text;

create table if not exists public.payout_statements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payout_batches(id) on delete cascade,
  trainer_id uuid not null references public.trainer_profiles(id) on delete restrict,
  statement_number text not null unique,
  gross_service_nok integer not null default 0,
  platform_fee_nok integer not null default 0,
  adjustments_nok integer not null default 0,
  payout_nok integer not null default 0,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(batch_id, trainer_id)
);

alter table public.payout_statements enable row level security;
drop policy if exists "payout_statements_trainer_read" on public.payout_statements;
drop policy if exists "payout_statements_admin_read" on public.payout_statements;
create policy "payout_statements_trainer_read" on public.payout_statements
  for select to authenticated using (trainer_id = auth.uid());
create policy "payout_statements_admin_read" on public.payout_statements
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create index if not exists payout_statements_trainer_created_idx
  on public.payout_statements(trainer_id, created_at desc);

-- Trainers may read only payout batches that contain one of their statements.
drop policy if exists "payout_batches_trainer_statement_read" on public.payout_batches;
create policy "payout_batches_trainer_statement_read" on public.payout_batches
  for select to authenticated using (
    exists (
      select 1 from public.payout_statements s
      where s.batch_id = payout_batches.id and s.trainer_id = auth.uid()
    )
  );

-- Resolve the earning period represented by a 10th/25th payout batch.
-- Weekend-shifted payout dates are still recognised by the half of the month they land in.
create or replace function public.payout_period_start(p_payout_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(day from p_payout_date) >= 20
      then date_trunc('month', p_payout_date::timestamp)::date
    else (date_trunc('month', p_payout_date::timestamp) - interval '1 month' + interval '15 days')::date
  end;
$$;

create or replace function public.payout_period_end(p_payout_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(day from p_payout_date) >= 20
      then (date_trunc('month', p_payout_date::timestamp) + interval '14 days')::date
    else (date_trunc('month', p_payout_date::timestamp) - interval '1 day')::date
  end;
$$;

-- Admin: hold/release one trainer's payouts without altering their own editable bank profile.
create or replace function public.set_trainer_payout_hold(
  p_trainer_id uuid,
  p_hold boolean,
  p_reason text default null,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'Kun administrator kan endre utbetalingsstatus.';
  end if;

  insert into public.trainer_payout_controls (trainer_id, payout_hold, hold_reason, admin_note, updated_at, updated_by)
  values (
    p_trainer_id,
    p_hold,
    case when p_hold then nullif(trim(coalesce(p_reason,'')), '') else null end,
    nullif(trim(coalesce(p_admin_note,'')), ''),
    now(),
    v_user_id
  )
  on conflict (trainer_id) do update set
    payout_hold = excluded.payout_hold,
    hold_reason = excluded.hold_reason,
    admin_note = excluded.admin_note,
    updated_at = now(),
    updated_by = v_user_id;
end;
$$;

-- Admin: manual positive/negative correction. Negative entries naturally carry forward.
create or replace function public.create_trainer_adjustment(
  p_trainer_id uuid,
  p_amount_nok integer,
  p_description text,
  p_payout_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_date date := coalesce(p_payout_date, public.scheduled_trainer_payout_date(now()));
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'Kun administrator kan opprette justeringer.';
  end if;
  if p_amount_nok = 0 then raise exception 'Beløpet kan ikke være 0.'; end if;
  if nullif(trim(coalesce(p_description,'')), '') is null then raise exception 'Beskrivelse er påkrevd.'; end if;

  insert into public.trainer_ledger (
    trainer_id, entry_type, description, gross_service_nok, platform_fee_nok,
    amount_nok, status, completed_at, scheduled_payout_date
  ) values (
    p_trainer_id, 'adjustment', trim(p_description), 0, 0,
    p_amount_nok, 'eligible', now(), v_date
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Rebuild batching so payout holds, missing bank details and negative carryovers are handled cleanly.
create or replace function public.create_payout_batch(p_payout_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_existing_status text;
  v_total integer := 0;
  v_trainers integer := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'Kun administrator kan opprette utbetalinger.';
  end if;

  select id, status into v_batch_id, v_existing_status
  from public.payout_batches where payout_date = p_payout_date;

  if v_existing_status = 'paid' then
    raise exception 'Denne utbetalingsbatchen er allerede betalt.';
  end if;

  if v_batch_id is null then
    insert into public.payout_batches (payout_date, period_start, period_end, status)
    values (p_payout_date, public.payout_period_start(p_payout_date), public.payout_period_end(p_payout_date), 'draft')
    returning id into v_batch_id;
  else
    update public.payout_batches
    set period_start = public.payout_period_start(p_payout_date),
        period_end = public.payout_period_end(p_payout_date)
    where id = v_batch_id;
  end if;

  -- Select trainers whose net eligible balance is positive and who are ready for payout.
  with payable_trainers as (
    select l.trainer_id
    from public.trainer_ledger l
    join public.trainer_payout_profiles pp on pp.trainer_id = l.trainer_id and pp.payout_ready = true
    left join public.trainer_payout_controls pc on pc.trainer_id = l.trainer_id
    where l.status = 'eligible'
      and l.scheduled_payout_date <= p_payout_date
      and coalesce(pc.payout_hold, false) = false
      and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id)
    group by l.trainer_id
    having sum(l.amount_nok) > 0
  )
  insert into public.payout_items (batch_id, trainer_id, ledger_entry_id, amount_nok)
  select v_batch_id, l.trainer_id, l.id, l.amount_nok
  from public.trainer_ledger l
  join payable_trainers pt on pt.trainer_id = l.trainer_id
  where l.status = 'eligible'
    and l.scheduled_payout_date <= p_payout_date
    and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id)
  on conflict (ledger_entry_id) do nothing;

  update public.trainer_ledger l
  set status = 'batched', payout_batch_id = v_batch_id
  where exists (
    select 1 from public.payout_items pi
    where pi.batch_id = v_batch_id and pi.ledger_entry_id = l.id
  );

  -- Recreate aggregate statements for draft batches.
  delete from public.payout_statements where batch_id = v_batch_id;

  insert into public.payout_statements (
    batch_id, trainer_id, statement_number,
    gross_service_nok, platform_fee_nok, adjustments_nok, payout_nok
  )
  select
    v_batch_id,
    pi.trainer_id,
    'AVR-' || to_char(p_payout_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    coalesce(sum(case when l.entry_type = 'earning' then l.gross_service_nok else 0 end),0)::integer,
    coalesce(sum(case when l.entry_type = 'earning' then l.platform_fee_nok else 0 end),0)::integer,
    coalesce(sum(case when l.entry_type = 'adjustment' then l.amount_nok else 0 end),0)::integer,
    coalesce(sum(l.amount_nok),0)::integer
  from public.payout_items pi
  join public.trainer_ledger l on l.id = pi.ledger_entry_id
  where pi.batch_id = v_batch_id
  group by pi.trainer_id;

  select coalesce(sum(s.payout_nok),0), count(*)
    into v_total, v_trainers
  from public.payout_statements s where s.batch_id = v_batch_id and s.payout_nok > 0;

  update public.payout_batches
  set total_nok = v_total, trainer_count = v_trainers
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

create or replace function public.mark_payout_batch_exported(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'Kun administrator kan eksportere utbetalinger.';
  end if;
  update public.payout_batches set exported_at = now() where id = p_batch_id and status = 'draft';
  if not found then raise exception 'Fant ikke en åpen utbetalingsbatch.'; end if;
end;
$$;

create or replace function public.mark_payout_batch_paid(p_batch_id uuid, p_bank_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_paid_at timestamptz := now();
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'Kun administrator kan markere utbetalinger som betalt.';
  end if;

  update public.payout_batches
  set status = 'paid', paid_at = v_paid_at, bank_reference = nullif(trim(coalesce(p_bank_reference,'')), '')
  where id = p_batch_id and status = 'draft';

  if not found then raise exception 'Fant ikke en åpen utbetalingsbatch.'; end if;

  update public.trainer_ledger
  set status = 'paid', paid_at = v_paid_at
  where payout_batch_id = p_batch_id and status = 'batched';

  update public.payout_statements set paid_at = v_paid_at where batch_id = p_batch_id;
end;
$$;

revoke execute on function public.set_trainer_payout_hold(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_trainer_payout_hold(uuid, boolean, text, text) to authenticated;
revoke execute on function public.create_trainer_adjustment(uuid, integer, text, date) from public, anon;
grant execute on function public.create_trainer_adjustment(uuid, integer, text, date) to authenticated;
revoke execute on function public.create_payout_batch(date) from public, anon;
grant execute on function public.create_payout_batch(date) to authenticated;
revoke execute on function public.mark_payout_batch_exported(uuid) from public, anon;
grant execute on function public.mark_payout_batch_exported(uuid) to authenticated;
revoke execute on function public.mark_payout_batch_paid(uuid, text) from public, anon;
grant execute on function public.mark_payout_batch_paid(uuid, text) to authenticated;
