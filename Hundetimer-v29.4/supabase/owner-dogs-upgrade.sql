-- MVP v10 owner profiles + multiple dogs
-- Run after the v9 profile/services upgrade.

create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  breed text,
  birth_date date,
  sex text not null default 'unknown' check (sex in ('female','male','unknown')),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dogs_owner_idx on public.dogs(owner_id, name);

alter table public.bookings add column if not exists dog_id uuid references public.dogs(id) on delete set null;
create index if not exists bookings_dog_idx on public.bookings(dog_id);

alter table public.dogs enable row level security;

drop policy if exists "dogs_owner_read" on public.dogs;
drop policy if exists "dogs_owner_insert" on public.dogs;
drop policy if exists "dogs_owner_update" on public.dogs;
drop policy if exists "dogs_owner_delete" on public.dogs;
drop policy if exists "dogs_trainer_booking_read" on public.dogs;
drop policy if exists "dogs_admin_read" on public.dogs;

create policy "dogs_owner_read" on public.dogs
  for select to authenticated using (owner_id = auth.uid());
create policy "dogs_owner_insert" on public.dogs
  for insert to authenticated with check (owner_id = auth.uid());
create policy "dogs_owner_update" on public.dogs
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dogs_owner_delete" on public.dogs
  for delete to authenticated using (owner_id = auth.uid());
create policy "dogs_trainer_booking_read" on public.dogs
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
      where b.dog_id = dogs.id and b.trainer_id = auth.uid()
    )
  );
create policy "dogs_admin_read" on public.dogs
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Require a saved dog when starting a new paid booking. The dog's name is copied
-- into bookings.dog_name so historical bookings remain readable if the profile changes later.
drop function if exists public.create_checkout_booking(uuid, text, text);

create or replace function public.create_checkout_booking(
  p_slot_id uuid,
  p_dog_id uuid,
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
  v_dog public.dogs%rowtype;
  v_booking_id uuid;
  v_platform_fee integer;
begin
  if v_user_id is null then raise exception 'Du må være logget inn.'; end if;

  select * into v_dog
  from public.dogs
  where id = p_dog_id and owner_id = v_user_id;
  if not found then raise exception 'Velg en hund fra profilen din.'; end if;

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
  if not found then raise exception 'Tjenesten er ikke tilgjengelig.'; end if;
  if v_service.trainer_id = v_user_id then raise exception 'Du kan ikke bestille din egen tjeneste.'; end if;

  v_platform_fee := ceil(v_service.price_nok * 0.075)::integer;
  update public.availability_slots set status = 'held' where id = v_slot.id;

  insert into public.bookings (
    customer_id, trainer_id, service_id, slot_id, dog_id, requested_starts_at, status,
    subtotal_nok, service_fee_nok, platform_fee_nok, dog_name, customer_note,
    payment_status, payment_hold_expires_at
  ) values (
    v_user_id, v_service.trainer_id, v_service.id, v_slot.id, v_dog.id, v_slot.starts_at, 'pending',
    v_service.price_nok, 29, v_platform_fee, trim(v_dog.name),
    nullif(trim(coalesce(p_customer_note, '')), ''), 'checkout_pending', now() + interval '35 minutes'
  ) returning id into v_booking_id;

  insert into public.booking_events (booking_id, actor_id, event_type, payload)
  values (
    v_booking_id,
    v_user_id,
    'checkout_started',
    jsonb_build_object('slot_id', v_slot.id, 'starts_at', v_slot.starts_at, 'dog_id', v_dog.id)
  );

  return v_booking_id;
end;
$$;

revoke execute on function public.create_checkout_booking(uuid, uuid, text) from public, anon;
grant execute on function public.create_checkout_booking(uuid, uuid, text) to authenticated;
