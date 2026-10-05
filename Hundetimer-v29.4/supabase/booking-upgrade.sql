-- MVP v4 booking flow upgrade
-- Run this once in Supabase SQL Editor after the v3 availability upgrade.

alter table public.bookings add column if not exists dog_name text;
alter table public.bookings add column if not exists customer_note text;
alter table public.reschedule_offers add column if not exists slot_id uuid references public.availability_slots(id);

create unique index if not exists bookings_active_slot_uidx
  on public.bookings(slot_id)
  where status in ('pending','confirmed','reschedule_offered');

-- Allow someone involved in a booking to see the other person's basic profile.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_read_booking_parties" on public.profiles;
create policy "profiles_read_booking_parties"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.bookings b
      where (b.customer_id = auth.uid() and b.trainer_id = profiles.id)
         or (b.trainer_id = auth.uid() and b.customer_id = profiles.id)
    )
  );

-- A customer atomically claims an open slot and creates the booking.
create or replace function public.request_booking(
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
  v_status public.booking_status;
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

  v_status := case when v_service.booking_mode = 'instant' then 'confirmed'::public.booking_status else 'pending'::public.booking_status end;

  update public.availability_slots
  set status = case when v_status = 'confirmed' then 'booked' else 'held' end
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
    trainer_response_due_at,
    confirmed_at,
    dog_name,
    customer_note
  ) values (
    v_user_id,
    v_service.trainer_id,
    v_service.id,
    v_slot.id,
    v_slot.starts_at,
    v_status,
    v_service.price_nok,
    29,
    0,
    case when v_status = 'pending' then now() + interval '24 hours' else null end,
    case when v_status = 'confirmed' then now() else null end,
    trim(p_dog_name),
    nullif(trim(coalesce(p_customer_note, '')), '')
  ) returning id into v_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (
    v_booking_id,
    v_user_id,
    case when v_status = 'confirmed' then 'booking_confirmed_instant' else 'booking_requested' end,
    jsonb_build_object('slot_id', v_slot.id, 'starts_at', v_slot.starts_at)
  );

  return v_booking_id;
end;
$$;

-- Trainer confirms a pending request.
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

-- Trainer declines a request (or withdraws an offered alternative).
create or replace function public.decline_booking(p_booking_id uuid)
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

  if v_booking.status not in ('pending','reschedule_offered') then
    raise exception 'Denne bestillingen kan ikke avslås.';
  end if;

  update public.availability_slots
  set status = 'open'
  where id = v_booking.slot_id and status = 'held';

  update public.reschedule_offers
  set status = 'expired'
  where booking_id = p_booking_id and status = 'pending';

  update public.bookings
  set status = 'declined_by_trainer', cancelled_at = now(), trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type)
  values (p_booking_id, v_user_id, 'booking_declined');
end;
$$;

-- Trainer releases the original held slot and proposes another open slot for the same service.
create or replace function public.offer_reschedule(
  p_booking_id uuid,
  p_slot_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_slot public.availability_slots%rowtype;
  v_offer_id uuid;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.trainer_id <> v_user_id or v_booking.status <> 'pending' then
    raise exception 'Bestillingen kan ikke flyttes.';
  end if;

  select * into v_slot
  from public.availability_slots
  where id = p_slot_id
  for update;

  if not found
     or v_slot.status <> 'open'
     or v_slot.trainer_id <> v_user_id
     or v_slot.service_id <> v_booking.service_id
     or v_slot.starts_at <= now() then
    raise exception 'Det nye tidspunktet er ikke tilgjengelig.';
  end if;

  update public.availability_slots set status = 'open'
  where id = v_booking.slot_id and status = 'held';

  update public.availability_slots set status = 'held'
  where id = v_slot.id;

  update public.reschedule_offers
  set status = 'expired'
  where booking_id = p_booking_id and status = 'pending';

  insert into public.reschedule_offers (
    booking_id, slot_id, proposed_starts_at, proposed_ends_at, note, status
  ) values (
    p_booking_id, v_slot.id, v_slot.starts_at, v_slot.ends_at,
    nullif(trim(coalesce(p_note, '')), ''), 'pending'
  ) returning id into v_offer_id;

  update public.bookings
  set status = 'reschedule_offered', slot_id = v_slot.id, trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (
    p_booking_id, v_user_id, 'reschedule_offered',
    jsonb_build_object('offer_id', v_offer_id, 'slot_id', v_slot.id, 'starts_at', v_slot.starts_at)
  );

  return v_offer_id;
end;
$$;

-- Customer accepts the trainer's proposed replacement time.
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

-- Customer rejects the alternative; the held alternative becomes open again and the request ends.
create or replace function public.decline_reschedule(p_booking_id uuid)
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

  select * into v_offer
  from public.reschedule_offers
  where booking_id = p_booking_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.availability_slots set status = 'open'
    where id = v_offer.slot_id and status = 'held';

    update public.reschedule_offers set status = 'declined'
    where id = v_offer.id;
  end if;

  update public.bookings
  set status = 'cancelled_by_customer', cancelled_at = now(), trainer_response_due_at = null
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type)
  values (p_booking_id, v_user_id, 'reschedule_declined');
end;
$$;

revoke execute on function public.request_booking(uuid, text, text) from public, anon;
revoke execute on function public.confirm_booking(uuid) from public, anon;
revoke execute on function public.decline_booking(uuid) from public, anon;
revoke execute on function public.offer_reschedule(uuid, uuid, text) from public, anon;
revoke execute on function public.accept_reschedule(uuid) from public, anon;
revoke execute on function public.decline_reschedule(uuid) from public, anon;

grant execute on function public.request_booking(uuid, text, text) to authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.decline_booking(uuid) to authenticated;
grant execute on function public.offer_reschedule(uuid, uuid, text) to authenticated;
grant execute on function public.accept_reschedule(uuid) to authenticated;
grant execute on function public.decline_reschedule(uuid) to authenticated;
