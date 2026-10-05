-- MVP v5 Stripe Connect + authorised payment upgrade
-- Run AFTER schema.sql, availability-upgrade.sql and booking-upgrade.sql.

alter table public.trainer_profiles add column if not exists payments_enabled boolean not null default false;

create table if not exists public.trainer_payment_accounts (
  trainer_id uuid primary key references public.trainer_profiles(id) on delete cascade,
  stripe_account_id text unique,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  transfers_active boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.trainer_payment_accounts enable row level security;
drop policy if exists "trainer_payment_accounts_read_own" on public.trainer_payment_accounts;
create policy "trainer_payment_accounts_read_own"
  on public.trainer_payment_accounts for select to authenticated
  using (trainer_id = auth.uid());

alter table public.bookings add column if not exists stripe_checkout_session_id text;
alter table public.bookings add column if not exists payment_status text not null default 'not_started';
alter table public.bookings add column if not exists payment_authorized_at timestamptz;
alter table public.bookings add column if not exists payment_captured_at timestamptz;
alter table public.bookings add column if not exists payment_cancelled_at timestamptz;
alter table public.bookings add column if not exists payment_hold_expires_at timestamptz;

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check check (
  payment_status in ('not_started','checkout_pending','authorized','captured','cancelled','failed','refunded')
);

create unique index if not exists bookings_checkout_session_uidx
  on public.bookings(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Create a booking and atomically hold the selected slot before redirecting to Stripe Checkout.
create or replace function public.create_checkout_booking(
  p_slot_id uuid,
  p_dog_name text,
  p_customer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_slot public.availability_slots%rowtype;
  v_service public.services%rowtype;
  v_payment public.trainer_payment_accounts%rowtype;
  v_booking_id uuid;
  v_platform_fee integer;
begin
  if v_user_id is null then
    raise exception 'Du må være logget inn.';
  end if;

  if nullif(trim(coalesce(p_dog_name, '')), '') is null then
    raise exception 'Skriv inn hundens navn.';
  end if;

  select * into v_slot
  from public.availability_slots
  where id = p_slot_id
  for update;

  if not found or v_slot.status <> 'open' or v_slot.starts_at <= now() then
    raise exception 'Denne tiden er ikke lenger ledig.';
  end if;

  select * into v_service
  from public.services
  where id = v_slot.service_id and active = true;

  if not found then
    raise exception 'Tjenesten er ikke tilgjengelig.';
  end if;

  if v_service.trainer_id = v_user_id then
    raise exception 'Du kan ikke bestille din egen tjeneste.';
  end if;

  select * into v_payment
  from public.trainer_payment_accounts
  where trainer_id = v_service.trainer_id;

  if v_payment.stripe_account_id is null or not v_payment.transfers_active then
    raise exception 'Denne treneren er ikke klar for nettbetaling ennå.';
  end if;

  v_platform_fee := ceil(v_service.price_nok * 0.075)::integer;

  update public.availability_slots
  set status = 'held'
  where id = v_slot.id;

  insert into public.bookings (
    customer_id,
    trainer_id,
    service_id,
    slot_id,
    requested_starts_at,
    status,
    subtotal_nok,
    service_fee_nok,
    platform_fee_nok,
    dog_name,
    customer_note,
    payment_status,
    payment_hold_expires_at
  ) values (
    v_user_id,
    v_service.trainer_id,
    v_service.id,
    v_slot.id,
    v_slot.starts_at,
    'pending',
    v_service.price_nok,
    29,
    v_platform_fee,
    trim(p_dog_name),
    nullif(trim(coalesce(p_customer_note, '')), ''),
    'checkout_pending',
    now() + interval '35 minutes'
  ) returning id into v_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (
    v_booking_id,
    v_user_id,
    'checkout_started',
    jsonb_build_object('slot_id', v_slot.id, 'starts_at', v_slot.starts_at)
  );

  return v_booking_id;
end;
$$;

-- Called when the customer explicitly cancels Checkout or Checkout creation fails.
create or replace function public.release_checkout_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.customer_id <> v_user_id then
    raise exception 'Bestillingen finnes ikke.';
  end if;

  if v_booking.payment_status <> 'checkout_pending' then
    return;
  end if;

  update public.availability_slots
  set status = 'open'
  where id = v_booking.slot_id and status = 'held';

  update public.bookings
  set status = 'cancelled_by_customer', payment_status = 'cancelled',
      payment_cancelled_at = now(), cancelled_at = now()
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type)
  values (p_booking_id, v_user_id, 'checkout_cancelled');
end;
$$;

-- Stripe webhook/system-only helpers. service_role bypasses RLS, but these functions
-- keep slot + booking transitions atomic.
create or replace function public.system_confirm_booking(
  p_booking_id uuid,
  p_event_type text default 'booking_confirmed_system'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Bestillingen finnes ikke.';
  end if;

  if v_booking.payment_status <> 'captured' then
    raise exception 'Betalingen er ikke trukket.';
  end if;

  update public.availability_slots
  set status = 'booked'
  where id = v_booking.slot_id and status in ('held','booked');

  update public.bookings
  set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()),
      trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, event_type)
  values (p_booking_id, p_event_type);
end;
$$;

create or replace function public.system_expire_checkout_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.payment_status <> 'checkout_pending' then
    return;
  end if;

  update public.availability_slots
  set status = 'open'
  where id = v_booking.slot_id and status = 'held';

  update public.bookings
  set status = 'cancelled_by_customer', payment_status = 'cancelled',
      payment_cancelled_at = now(), cancelled_at = now()
  where id = p_booking_id;

  insert into public.booking_events (booking_id, event_type)
  values (p_booking_id, 'checkout_expired');
end;
$$;

-- Trainer can only confirm once Stripe capture has succeeded.
create or replace function public.confirm_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.trainer_id <> v_user_id then
    raise exception 'Bestillingen finnes ikke.';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'Denne bestillingen kan ikke bekreftes.';
  end if;

  if v_booking.payment_status <> 'captured' then
    raise exception 'Betalingen er ikke trukket ennå.';
  end if;

  update public.availability_slots
  set status = 'booked'
  where id = v_booking.slot_id and status = 'held';

  update public.bookings
  set status = 'confirmed', confirmed_at = now(), trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type)
  values (p_booking_id, v_user_id, 'booking_confirmed');
end;
$$;

-- Customer accepts a proposed replacement time only after the authorised payment was captured.
create or replace function public.accept_reschedule(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_offer public.reschedule_offers%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.customer_id <> v_user_id or v_booking.status <> 'reschedule_offered' then
    raise exception 'Bestillingen kan ikke oppdateres.';
  end if;

  if v_booking.payment_status <> 'captured' then
    raise exception 'Betalingen er ikke trukket ennå.';
  end if;

  select * into v_offer
  from public.reschedule_offers
  where booking_id = p_booking_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Fant ikke det foreslåtte tidspunktet.';
  end if;

  update public.availability_slots
  set status = 'booked'
  where id = v_offer.slot_id and status = 'held';

  if not found then
    raise exception 'Det foreslåtte tidspunktet er ikke lenger reservert.';
  end if;

  update public.reschedule_offers
  set status = case when id = v_offer.id then 'accepted' else 'expired' end
  where booking_id = p_booking_id and status = 'pending';

  update public.bookings
  set status = 'confirmed', requested_starts_at = v_offer.proposed_starts_at,
      confirmed_at = now(), trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (p_booking_id, v_user_id, 'reschedule_accepted', jsonb_build_object('offer_id', v_offer.id));
end;
$$;

-- Paid flow must go through controlled RPCs. Prevent direct inserts and the old no-payment booking RPC.
drop policy if exists "bookings_customer_create" on public.bookings;
drop policy if exists "reschedule_trainer_create" on public.reschedule_offers;
revoke execute on function public.request_booking(uuid, text, text) from authenticated;

revoke execute on function public.create_checkout_booking(uuid, text, text) from public, anon;
revoke execute on function public.release_checkout_booking(uuid) from public, anon;
grant execute on function public.create_checkout_booking(uuid, text, text) to authenticated;
grant execute on function public.release_checkout_booking(uuid) to authenticated;

revoke execute on function public.system_confirm_booking(uuid, text) from public, anon, authenticated;
revoke execute on function public.system_expire_checkout_booking(uuid) from public, anon, authenticated;
grant execute on function public.system_confirm_booking(uuid, text) to service_role;
grant execute on function public.system_expire_checkout_booking(uuid) to service_role;

-- v6 platform payout override. For a clean install, run platform-payout-upgrade.sql after this file.
-- MVP v6 platform payments + scheduled trainer payouts
-- Upgrade an existing v5 database by running this file once in Supabase SQL Editor.
-- Customer payments stay on the platform Stripe account. Trainers are paid by bank transfer.

-- Trainer payout/bank details. Only the trainer and admins may read these rows.
create table if not exists public.trainer_payout_profiles (
  trainer_id uuid primary key references public.trainer_profiles(id) on delete cascade,
  account_holder_name text,
  bank_account_number text,
  organisation_number text,
  vat_registered boolean not null default false,
  payout_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trainer_payout_profiles enable row level security;
drop policy if exists "trainer_payout_profiles_own_read" on public.trainer_payout_profiles;
drop policy if exists "trainer_payout_profiles_own_insert" on public.trainer_payout_profiles;
drop policy if exists "trainer_payout_profiles_own_update" on public.trainer_payout_profiles;
drop policy if exists "trainer_payout_profiles_admin_read" on public.trainer_payout_profiles;
create policy "trainer_payout_profiles_own_read" on public.trainer_payout_profiles
  for select to authenticated using (trainer_id = auth.uid());
create policy "trainer_payout_profiles_own_insert" on public.trainer_payout_profiles
  for insert to authenticated with check (trainer_id = auth.uid());
create policy "trainer_payout_profiles_own_update" on public.trainer_payout_profiles
  for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy "trainer_payout_profiles_admin_read" on public.trainer_payout_profiles
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create table if not exists public.trainer_ledger (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete restrict,
  entry_type text not null default 'earning' check (entry_type in ('earning','adjustment')),
  description text not null,
  gross_service_nok int not null default 0,
  platform_fee_nok int not null default 0,
  amount_nok int not null,
  status text not null default 'eligible' check (status in ('eligible','batched','paid','reversed')),
  completed_at timestamptz,
  scheduled_payout_date date,
  payout_batch_id uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists trainer_ledger_booking_earning_uidx
  on public.trainer_ledger(booking_id)
  where booking_id is not null and entry_type = 'earning';

alter table public.trainer_ledger enable row level security;
drop policy if exists "trainer_ledger_read_own" on public.trainer_ledger;
drop policy if exists "trainer_ledger_admin_read" on public.trainer_ledger;
create policy "trainer_ledger_read_own" on public.trainer_ledger
  for select to authenticated using (trainer_id = auth.uid());
create policy "trainer_ledger_admin_read" on public.trainer_ledger
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  payout_date date not null,
  status text not null default 'draft' check (status in ('draft','paid','cancelled')),
  total_nok int not null default 0,
  trainer_count int not null default 0,
  bank_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(payout_date)
);

create table if not exists public.payout_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payout_batches(id) on delete cascade,
  trainer_id uuid not null references public.trainer_profiles(id) on delete restrict,
  ledger_entry_id uuid not null unique references public.trainer_ledger(id) on delete restrict,
  amount_nok int not null,
  created_at timestamptz not null default now()
);

alter table public.payout_batches enable row level security;
alter table public.payout_items enable row level security;
drop policy if exists "payout_batches_admin_read" on public.payout_batches;
drop policy if exists "payout_items_admin_read" on public.payout_items;
drop policy if exists "payout_items_trainer_read" on public.payout_items;
create policy "payout_batches_admin_read" on public.payout_batches
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "payout_items_admin_read" on public.payout_items
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "payout_items_trainer_read" on public.payout_items
  for select to authenticated using (trainer_id = auth.uid());

-- Future foreign key after both tables exist.
do $$ begin
  alter table public.trainer_ledger
    add constraint trainer_ledger_payout_batch_fk
    foreign key (payout_batch_id) references public.payout_batches(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- Assign a completed session to the 25th when completed 1-15,
-- otherwise the 10th of the following month. Weekend dates roll to Monday.
create or replace function public.scheduled_trainer_payout_date(p_completed_at timestamptz)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local_date date := (p_completed_at at time zone 'Europe/Oslo')::date;
  v_base date;
  v_dow integer;
begin
  if extract(day from v_local_date) <= 15 then
    v_base := make_date(extract(year from v_local_date)::int, extract(month from v_local_date)::int, 25);
  else
    v_base := (date_trunc('month', v_local_date::timestamp) + interval '1 month 9 days')::date;
  end if;

  v_dow := extract(isodow from v_base)::int;
  if v_dow = 6 then v_base := v_base + 2; end if;
  if v_dow = 7 then v_base := v_base + 1; end if;
  return v_base;
end;
$$;

-- Replace the v5 checkout RPC. Trainers no longer need a Stripe Connect account.
create or replace function public.create_checkout_booking(
  p_slot_id uuid,
  p_dog_name text,
  p_customer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_slot public.availability_slots%rowtype;
  v_service public.services%rowtype;
  v_booking_id uuid;
  v_platform_fee integer;
begin
  if v_user_id is null then raise exception 'Du må være logget inn.'; end if;
  if nullif(trim(coalesce(p_dog_name, '')), '') is null then raise exception 'Skriv inn hundens navn.'; end if;

  select * into v_slot from public.availability_slots where id = p_slot_id for update;
  if not found or v_slot.status <> 'open' or v_slot.starts_at <= now() then
    raise exception 'Denne tiden er ikke lenger ledig.';
  end if;

  select * into v_service from public.services where id = v_slot.service_id and active = true;
  if not found then raise exception 'Tjenesten er ikke tilgjengelig.'; end if;
  if v_service.trainer_id = v_user_id then raise exception 'Du kan ikke bestille din egen tjeneste.'; end if;

  v_platform_fee := ceil(v_service.price_nok * 0.075)::integer;
  update public.availability_slots set status = 'held' where id = v_slot.id;

  insert into public.bookings (
    customer_id, trainer_id, service_id, slot_id, requested_starts_at, status,
    subtotal_nok, service_fee_nok, platform_fee_nok, dog_name, customer_note,
    payment_status, payment_hold_expires_at
  ) values (
    v_user_id, v_service.trainer_id, v_service.id, v_slot.id, v_slot.starts_at, 'pending',
    v_service.price_nok, 29, v_platform_fee, trim(p_dog_name),
    nullif(trim(coalesce(p_customer_note, '')), ''), 'checkout_pending', now() + interval '35 minutes'
  ) returning id into v_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (v_booking_id, v_user_id, 'checkout_started', jsonb_build_object('slot_id', v_slot.id, 'starts_at', v_slot.starts_at));
  return v_booking_id;
end;
$$;

-- Mark a past confirmed session as completed and create exactly one trainer earning entry.
create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_completed_at timestamptz := now();
  v_trainer_amount integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.trainer_id <> v_user_id then raise exception 'Bestillingen finnes ikke.'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'Bare bekreftede timer kan fullføres.'; end if;
  if v_booking.payment_status <> 'captured' then raise exception 'Betalingen er ikke trukket.'; end if;
  if v_booking.requested_starts_at > now() then raise exception 'Timen har ikke startet ennå.'; end if;

  v_trainer_amount := greatest(0, v_booking.subtotal_nok - v_booking.platform_fee_nok);

  update public.bookings set status = 'completed' where id = p_booking_id;

  insert into public.trainer_ledger (
    trainer_id, booking_id, entry_type, description, gross_service_nok,
    platform_fee_nok, amount_nok, status, completed_at, scheduled_payout_date
  ) values (
    v_booking.trainer_id, v_booking.id, 'earning', 'Fullført hundetrening',
    v_booking.subtotal_nok, v_booking.platform_fee_nok, v_trainer_amount,
    'eligible', v_completed_at, public.scheduled_trainer_payout_date(v_completed_at)
  ) on conflict do nothing;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (p_booking_id, v_user_id, 'booking_completed', jsonb_build_object('trainer_amount_nok', v_trainer_amount));
end;
$$;

-- Admin-only: turn all unpaid eligible entries due on/before a payout date into one batch.
create or replace function public.create_payout_batch(p_payout_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_total integer;
  v_trainers integer;
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'Kun administrator kan opprette utbetalinger.';
  end if;

  insert into public.payout_batches (payout_date, status)
  values (p_payout_date, 'draft')
  on conflict (payout_date) do update set payout_date = excluded.payout_date
  returning id into v_batch_id;

  insert into public.payout_items (batch_id, trainer_id, ledger_entry_id, amount_nok)
  select v_batch_id, l.trainer_id, l.id, l.amount_nok
  from public.trainer_ledger l
  where l.status = 'eligible'
    and l.scheduled_payout_date <= p_payout_date
    and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id)
  on conflict (ledger_entry_id) do nothing;

  update public.trainer_ledger l
  set status = 'batched', payout_batch_id = v_batch_id
  where exists (select 1 from public.payout_items pi where pi.batch_id = v_batch_id and pi.ledger_entry_id = l.id);

  select coalesce(sum(pi.amount_nok),0), count(distinct pi.trainer_id)
    into v_total, v_trainers
  from public.payout_items pi where pi.batch_id = v_batch_id;

  update public.payout_batches set total_nok = v_total, trainer_count = v_trainers where id = v_batch_id;
  return v_batch_id;
end;
$$;

-- Admin-only: after bank transfers are sent, mark the whole batch and ledger entries paid.
create or replace function public.mark_payout_batch_paid(p_batch_id uuid, p_bank_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'admin') then
    raise exception 'Kun administrator kan markere utbetalinger som betalt.';
  end if;

  update public.payout_batches
  set status = 'paid', paid_at = now(), bank_reference = nullif(trim(coalesce(p_bank_reference,'')), '')
  where id = p_batch_id and status = 'draft';

  if not found then raise exception 'Fant ikke en åpen utbetalingsbatch.'; end if;

  update public.trainer_ledger l
  set status = 'paid', paid_at = now()
  where l.payout_batch_id = p_batch_id and l.status = 'batched';
end;
$$;

revoke execute on function public.complete_booking(uuid) from public, anon;
grant execute on function public.complete_booking(uuid) to authenticated;
revoke execute on function public.create_payout_batch(date) from public, anon;
grant execute on function public.create_payout_batch(date) to authenticated;
revoke execute on function public.mark_payout_batch_paid(uuid, text) from public, anon;
grant execute on function public.mark_payout_batch_paid(uuid, text) to authenticated;
