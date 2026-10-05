-- MVP v7 cancellations, refunds and trainer-response expiry
-- Run AFTER platform-payout-upgrade.sql.

alter table public.bookings add column if not exists cancelled_by text;
alter table public.bookings add column if not exists cancellation_reason text;
alter table public.bookings add column if not exists expired_at timestamptz;
alter table public.bookings add column if not exists stripe_refund_id text;
alter table public.bookings add column if not exists refund_status text not null default 'none';
alter table public.bookings add column if not exists refund_amount_nok int not null default 0;
alter table public.bookings add column if not exists refunded_at timestamptz;

alter table public.bookings drop constraint if exists bookings_cancelled_by_check;
alter table public.bookings add constraint bookings_cancelled_by_check check (
  cancelled_by is null or cancelled_by in ('customer','trainer','system','admin')
);

alter table public.bookings drop constraint if exists bookings_refund_status_check;
alter table public.bookings add constraint bookings_refund_status_check check (
  refund_status in ('none','pending','succeeded','failed','cancelled','requires_action')
);

alter table public.bookings drop constraint if exists bookings_refund_amount_check;
alter table public.bookings add constraint bookings_refund_amount_check check (refund_amount_nok >= 0);

create unique index if not exists bookings_stripe_refund_uidx
  on public.bookings(stripe_refund_id)
  where stripe_refund_id is not null;

-- Called only after the server has either cancelled an uncaptured Stripe
-- authorization or successfully created a Stripe refund for a captured payment.
create or replace function public.cancel_booking_by_customer(
  p_booking_id uuid,
  p_reason text default null
)
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

  if v_booking.status not in ('pending','reschedule_offered','confirmed') then
    raise exception 'Denne bestillingen kan ikke avbestilles.';
  end if;

  if v_booking.requested_starts_at <= now() then
    raise exception 'Timen har allerede startet.';
  end if;

  if v_booking.payment_status not in ('cancelled','refunded','captured') then
    raise exception 'Betalingen må frigjøres eller refunderes først.';
  end if;

  if v_booking.payment_status = 'captured' and v_booking.refund_status not in ('pending','succeeded') then
    raise exception 'Refusjonen er ikke opprettet.';
  end if;

  update public.availability_slots
  set status = 'open'
  where id = v_booking.slot_id and status in ('held','booked') and starts_at > now();

  update public.reschedule_offers
  set status = 'expired'
  where booking_id = p_booking_id and status = 'pending';

  update public.bookings
  set status = 'cancelled_by_customer',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason = nullif(trim(coalesce(p_reason,'')), ''),
      trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (
    p_booking_id,
    v_user_id,
    'booking_cancelled_by_customer',
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason,'')), ''), 'refund_status', v_booking.refund_status)
  );
end;
$$;

create or replace function public.cancel_booking_by_trainer(
  p_booking_id uuid,
  p_reason text default null
)
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

  if v_booking.status not in ('pending','reschedule_offered','confirmed') then
    raise exception 'Denne bestillingen kan ikke avbestilles.';
  end if;

  if v_booking.requested_starts_at <= now() then
    raise exception 'Timen har allerede startet.';
  end if;

  if v_booking.payment_status not in ('cancelled','refunded','captured') then
    raise exception 'Betalingen må frigjøres eller refunderes først.';
  end if;

  if v_booking.payment_status = 'captured' and v_booking.refund_status not in ('pending','succeeded') then
    raise exception 'Refusjonen er ikke opprettet.';
  end if;

  update public.availability_slots
  set status = 'open'
  where id = v_booking.slot_id and status in ('held','booked') and starts_at > now();

  update public.reschedule_offers
  set status = 'expired'
  where booking_id = p_booking_id and status = 'pending';

  update public.bookings
  set status = 'declined_by_trainer',
      cancelled_at = now(),
      cancelled_by = 'trainer',
      cancellation_reason = nullif(trim(coalesce(p_reason,'')), ''),
      trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (
    p_booking_id,
    v_user_id,
    'booking_cancelled_by_trainer',
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason,'')), ''), 'refund_status', v_booking.refund_status)
  );
end;
$$;

-- Final database step after the server has cancelled the Stripe authorization
-- for a trainer who did not answer within 24 hours. We keep the existing enum
-- status for compatibility and use expired_at to distinguish a timeout in the UI.
create or replace function public.system_expire_trainer_response_booking(p_booking_id uuid)
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

  if not found then return; end if;
  if v_booking.status <> 'pending' then return; end if;
  if v_booking.trainer_response_due_at is null or v_booking.trainer_response_due_at > now() then return; end if;
  if v_booking.payment_status <> 'cancelled' then
    raise exception 'Kortreservasjonen må frigjøres først.';
  end if;

  update public.availability_slots
  set status = 'open'
  where id = v_booking.slot_id and status = 'held' and starts_at > now();

  update public.bookings
  set status = 'declined_by_trainer',
      cancelled_at = now(),
      cancelled_by = 'system',
      cancellation_reason = 'Treneren svarte ikke innen 24 timer.',
      expired_at = now(),
      trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (p_booking_id, null, 'trainer_response_expired', jsonb_build_object('response_window_hours', 24));
end;
$$;

revoke execute on function public.cancel_booking_by_customer(uuid, text) from public, anon;
grant execute on function public.cancel_booking_by_customer(uuid, text) to authenticated;
revoke execute on function public.cancel_booking_by_trainer(uuid, text) from public, anon;
grant execute on function public.cancel_booking_by_trainer(uuid, text) to authenticated;
revoke execute on function public.system_expire_trainer_response_booking(uuid) from public, anon, authenticated;
grant execute on function public.system_expire_trainer_response_booking(uuid) to service_role;
