create extension if not exists pgcrypto;

do $$ begin
  create type public.booking_status as enum (
    'pending',
    'confirmed',
    'reschedule_offered',
    'cancelled_by_customer',
    'declined_by_trainer',
    'refunded',
    'completed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','trainer','admin')),
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  slug text unique not null,
  business_name text not null,
  bio text,
  city text not null,
  specialties text[] not null default '{}',
  latitude numeric,
  longitude numeric,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  title text not null,
  description text,
  duration_minutes int not null check (duration_minutes > 0),
  price_nok int not null check (price_nok >= 0),
  active boolean not null default true,
  booking_mode text not null default 'request' check (booking_mode in ('request','instant')),
  delivery_mode text not null default 'in_person' check (delivery_mode in ('in_person','online','both')),
  slot_interval_minutes int not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_availability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Europe/Oslo',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null check (kind in ('available','blocked')),
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','held','booked','blocked')),
  created_at timestamptz not null default now(),
  unique(service_id, starts_at),
  check (ends_at > starts_at)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  trainer_id uuid not null references public.trainer_profiles(id),
  service_id uuid not null references public.services(id),
  slot_id uuid references public.availability_slots(id),
  requested_starts_at timestamptz not null,
  status public.booking_status not null default 'pending',
  subtotal_nok int not null check (subtotal_nok >= 0),
  service_fee_nok int not null default 0 check (service_fee_nok >= 0),
  platform_fee_nok int not null default 0 check (platform_fee_nok >= 0),
  stripe_payment_intent_id text,
  trainer_response_due_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

create table if not exists public.reschedule_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  proposed_starts_at timestamptz not null,
  proposed_ends_at timestamptz not null,
  note text,
  status text not null default 'pending' check(status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  check (proposed_ends_at > proposed_starts_at)
);

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'owner',
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'bruker'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.trainer_profiles enable row level security;
alter table public.services enable row level security;
alter table public.weekly_availability enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.availability_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.reschedule_offers enable row level security;
alter table public.booking_events enable row level security;

-- Re-running this file should replace the MVP policies cleanly.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    if p.tablename in ('profiles','trainer_profiles','services','weekly_availability','availability_exceptions','availability_slots','bookings','reschedule_offers','booking_events') then
      execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    end if;
  end loop;
end $$;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "trainer_profiles_public_read" on public.trainer_profiles for select to anon, authenticated using (true);
create policy "trainer_profiles_insert_own" on public.trainer_profiles for insert to authenticated with check (id = auth.uid());
create policy "trainer_profiles_update_own" on public.trainer_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "trainer_profiles_delete_own" on public.trainer_profiles for delete to authenticated using (id = auth.uid());

create policy "services_public_read" on public.services for select to anon, authenticated using (active = true or trainer_id = auth.uid());
create policy "services_insert_own" on public.services for insert to authenticated with check (trainer_id = auth.uid());
create policy "services_update_own" on public.services for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy "services_delete_own" on public.services for delete to authenticated using (trainer_id = auth.uid());

create policy "weekly_availability_public_read" on public.weekly_availability for select to anon, authenticated using (active = true or trainer_id = auth.uid());
create policy "weekly_availability_insert_own" on public.weekly_availability for insert to authenticated with check (trainer_id = auth.uid());
create policy "weekly_availability_update_own" on public.weekly_availability for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
create policy "weekly_availability_delete_own" on public.weekly_availability for delete to authenticated using (trainer_id = auth.uid());

create policy "availability_exceptions_own" on public.availability_exceptions for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

create policy "availability_slots_public_read" on public.availability_slots for select to anon, authenticated using (status = 'open' or trainer_id = auth.uid());
create policy "availability_slots_write_own" on public.availability_slots for all to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

create policy "bookings_read_parties" on public.bookings for select to authenticated using (customer_id = auth.uid() or trainer_id = auth.uid());
create policy "bookings_customer_create" on public.bookings for insert to authenticated with check (customer_id = auth.uid());

create policy "reschedule_read_parties" on public.reschedule_offers for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.trainer_id = auth.uid()))
);
create policy "reschedule_trainer_create" on public.reschedule_offers for insert to authenticated with check (
  exists (select 1 from public.bookings b where b.id = booking_id and b.trainer_id = auth.uid())
);

create policy "booking_events_read_parties" on public.booking_events for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.trainer_id = auth.uid()))
);
create policy "booking_events_insert_party" on public.booking_events for insert to authenticated with check (
  actor_id = auth.uid() and exists (select 1 from public.bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.trainer_id = auth.uid()))
);

create index if not exists services_trainer_idx on public.services(trainer_id);
create index if not exists weekly_availability_trainer_idx on public.weekly_availability(trainer_id, weekday);
create index if not exists bookings_trainer_date_idx on public.bookings(trainer_id, requested_starts_at);
create index if not exists bookings_customer_date_idx on public.bookings(customer_id, requested_starts_at);

create index if not exists availability_slots_service_date_idx on public.availability_slots(service_id, starts_at, status);
create index if not exists availability_exceptions_service_date_idx on public.availability_exceptions(service_id, starts_at, ends_at);
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
