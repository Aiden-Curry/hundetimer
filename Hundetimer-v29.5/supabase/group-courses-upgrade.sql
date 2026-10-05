-- MVP v12: group courses and events
-- Run once after the v11 reviews migration.

create table if not exists public.group_offerings (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  kind text not null default 'course' check (kind in ('course','event')),
  title text not null,
  description text,
  city text not null,
  venue_name text,
  address text,
  is_online boolean not null default false,
  price_nok integer not null default 0 check (price_nok >= 0),
  capacity integer not null default 8 check (capacity > 0 and capacity <= 500),
  confirmed_count integer not null default 0 check (confirmed_count >= 0),
  active boolean not null default true,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.group_offerings(id) on delete cascade,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.group_enrollments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.group_offerings(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  dog_id uuid references public.dogs(id) on delete set null,
  dog_name text not null,
  customer_note text,
  status text not null default 'checkout_pending' check (status in ('checkout_pending','confirmed','cancelled','refunded','completed')),
  subtotal_nok integer not null default 0 check (subtotal_nok >= 0),
  service_fee_nok integer not null default 0 check (service_fee_nok >= 0),
  platform_fee_nok integer not null default 0 check (platform_fee_nok >= 0),
  payment_status text not null default 'checkout_pending' check (payment_status in ('checkout_pending','captured','cancelled','refunded')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_refund_id text,
  refund_status text,
  checkout_expires_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists group_sessions_offering_start_idx on public.group_sessions(offering_id, starts_at);
create index if not exists group_enrollments_offering_status_idx on public.group_enrollments(offering_id, status);
create index if not exists group_enrollments_customer_idx on public.group_enrollments(customer_id, created_at desc);
create unique index if not exists group_enrollment_active_dog_uidx
  on public.group_enrollments(offering_id, dog_id)
  where dog_id is not null and status in ('checkout_pending','confirmed');

alter table public.trainer_ledger add column if not exists enrollment_id uuid references public.group_enrollments(id) on delete restrict;
create unique index if not exists trainer_ledger_group_enrollment_earning_uidx
  on public.trainer_ledger(enrollment_id)
  where enrollment_id is not null and entry_type = 'earning';

alter table public.group_offerings enable row level security;
alter table public.group_sessions enable row level security;
alter table public.group_enrollments enable row level security;

create or replace function public.can_read_group_offering(p_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_offerings o
    where o.id = p_offering_id
      and (
        o.active = true
        or o.trainer_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
        or exists (select 1 from public.group_enrollments e where e.offering_id = o.id and e.customer_id = auth.uid())
      )
  );
$$;

drop policy if exists "group_offerings_public_read" on public.group_offerings;
drop policy if exists "group_offerings_trainer_insert" on public.group_offerings;
drop policy if exists "group_offerings_trainer_update" on public.group_offerings;
drop policy if exists "group_sessions_public_read" on public.group_sessions;
drop policy if exists "group_sessions_trainer_insert" on public.group_sessions;
drop policy if exists "group_sessions_trainer_update" on public.group_sessions;
drop policy if exists "group_sessions_trainer_delete" on public.group_sessions;
drop policy if exists "group_enrollments_owner_read" on public.group_enrollments;
drop policy if exists "group_enrollments_trainer_read" on public.group_enrollments;
drop policy if exists "group_enrollments_admin_read" on public.group_enrollments;

create policy "group_offerings_public_read" on public.group_offerings
  for select to public using (public.can_read_group_offering(id));
create policy "group_offerings_trainer_insert" on public.group_offerings
  for insert to authenticated with check (trainer_id = auth.uid());
create policy "group_offerings_trainer_update" on public.group_offerings
  for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

create policy "group_sessions_public_read" on public.group_sessions
  for select to public using (public.can_read_group_offering(offering_id));
create policy "group_sessions_trainer_insert" on public.group_sessions
  for insert to authenticated with check (exists (
    select 1 from public.group_offerings o where o.id = offering_id and o.trainer_id = auth.uid()
  ));
create policy "group_sessions_trainer_update" on public.group_sessions
  for update to authenticated using (exists (
    select 1 from public.group_offerings o where o.id = offering_id and o.trainer_id = auth.uid()
  ));
create policy "group_sessions_trainer_delete" on public.group_sessions
  for delete to authenticated using (exists (
    select 1 from public.group_offerings o where o.id = offering_id and o.trainer_id = auth.uid()
  ));

create policy "group_enrollments_owner_read" on public.group_enrollments
  for select to authenticated using (customer_id = auth.uid());
create policy "group_enrollments_trainer_read" on public.group_enrollments
  for select to authenticated using (exists (
    select 1 from public.group_offerings o where o.id = offering_id and o.trainer_id = auth.uid()
  ));
create policy "group_enrollments_admin_read" on public.group_enrollments
  for select to authenticated using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Reserve one place before sending the customer to Stripe Checkout.
-- The offering row is locked while capacity is checked, preventing overselling.
create or replace function public.create_group_checkout_enrollment(
  p_offering_id uuid,
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
  v_offering public.group_offerings%rowtype;
  v_dog public.dogs%rowtype;
  v_reserved integer;
  v_enrollment_id uuid;
  v_platform_fee integer;
  v_first_start timestamptz;
begin
  if v_user_id is null then raise exception 'Du må være logget inn.'; end if;

  select * into v_offering from public.group_offerings where id = p_offering_id for update;
  if not found or not v_offering.active or v_offering.completed_at is not null then
    raise exception 'Kurset eller arrangementet er ikke tilgjengelig.';
  end if;
  if v_offering.trainer_id = v_user_id then raise exception 'Du kan ikke bestille ditt eget arrangement.'; end if;

  select * into v_dog from public.dogs where id = p_dog_id and owner_id = v_user_id;
  if not found then raise exception 'Velg en av hundene dine.'; end if;

  select min(starts_at) into v_first_start from public.group_sessions where offering_id = p_offering_id;
  if v_first_start is null then raise exception 'Ingen datoer er publisert ennå.'; end if;
  if v_first_start <= now() then raise exception 'Påmeldingen er stengt fordi kurset eller arrangementet har startet.'; end if;

  -- Clear stale checkout reservations before counting places.
  update public.group_enrollments
  set status = 'cancelled', payment_status = 'cancelled', cancelled_at = now()
  where offering_id = p_offering_id
    and status = 'checkout_pending'
    and checkout_expires_at is not null
    and checkout_expires_at <= now();

  if exists (
    select 1 from public.group_enrollments
    where offering_id = p_offering_id and dog_id = p_dog_id
      and status in ('checkout_pending','confirmed')
  ) then
    raise exception 'Denne hunden er allerede påmeldt.';
  end if;

  select count(*) into v_reserved
  from public.group_enrollments
  where offering_id = p_offering_id
    and (
      status = 'confirmed'
      or (status = 'checkout_pending' and (checkout_expires_at is null or checkout_expires_at > now()))
    );

  if v_reserved >= v_offering.capacity then raise exception 'Det er dessverre fullt.'; end if;

  v_platform_fee := ceil(v_offering.price_nok * 0.075)::integer;

  insert into public.group_enrollments (
    offering_id, customer_id, dog_id, dog_name, customer_note,
    subtotal_nok, service_fee_nok, platform_fee_nok, checkout_expires_at
  ) values (
    p_offering_id, v_user_id, v_dog.id, v_dog.name, nullif(trim(coalesce(p_customer_note, '')), ''),
    v_offering.price_nok, 29, v_platform_fee, now() + interval '35 minutes'
  ) returning id into v_enrollment_id;

  return v_enrollment_id;
end;
$$;

-- Called by Stripe webhook/service role. Idempotent confirmation and counter update.
create or replace function public.system_confirm_group_enrollment(
  p_enrollment_id uuid,
  p_payment_intent_id text,
  p_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.group_enrollments%rowtype;
begin
  select * into v_enrollment from public.group_enrollments where id = p_enrollment_id for update;
  if not found then return; end if;
  if v_enrollment.status = 'confirmed' or v_enrollment.status = 'completed' then return; end if;
  if v_enrollment.status <> 'checkout_pending' then return; end if;

  update public.group_enrollments
  set status = 'confirmed', payment_status = 'captured', stripe_payment_intent_id = p_payment_intent_id,
      stripe_checkout_session_id = p_checkout_session_id, paid_at = now(), checkout_expires_at = null
  where id = p_enrollment_id;

  update public.group_offerings
  set confirmed_count = confirmed_count + 1, updated_at = now()
  where id = v_enrollment.offering_id;
end;
$$;

create or replace function public.system_expire_group_checkout(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_enrollments
  set status = 'cancelled', payment_status = 'cancelled', cancelled_at = now()
  where id = p_enrollment_id and status = 'checkout_pending';
end;
$$;

-- Trainer marks the whole course/event completed after its final session.
-- Every confirmed enrollment becomes one trainer earning entry in the normal payout ledger.
create or replace function public.complete_group_offering(p_offering_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_offering public.group_offerings%rowtype;
  v_last_end timestamptz;
  v_completed_at timestamptz := now();
  v_count integer := 0;
  r record;
begin
  select * into v_offering from public.group_offerings where id = p_offering_id for update;
  if not found or v_offering.trainer_id <> v_user_id then raise exception 'Kurset eller arrangementet finnes ikke.'; end if;
  if v_offering.completed_at is not null then return 0; end if;

  select max(ends_at) into v_last_end from public.group_sessions where offering_id = p_offering_id;
  if v_last_end is null then raise exception 'Ingen datoer er registrert.'; end if;
  if v_last_end > now() then raise exception 'Siste samling er ikke ferdig ennå.'; end if;

  for r in
    select * from public.group_enrollments
    where offering_id = p_offering_id and status = 'confirmed' and payment_status = 'captured'
    for update
  loop
    update public.group_enrollments set status = 'completed', completed_at = v_completed_at where id = r.id;

    insert into public.trainer_ledger (
      trainer_id, enrollment_id, entry_type, description, gross_service_nok,
      platform_fee_nok, amount_nok, status, completed_at, scheduled_payout_date
    ) values (
      v_offering.trainer_id, r.id, 'earning',
      case when v_offering.kind = 'course' then 'Fullført gruppekurs' else 'Fullført arrangement' end,
      r.subtotal_nok, r.platform_fee_nok, greatest(0, r.subtotal_nok - r.platform_fee_nok),
      'eligible', v_completed_at, public.scheduled_trainer_payout_date(v_completed_at)
    ) on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  update public.group_offerings set completed_at = v_completed_at, active = false, updated_at = now() where id = p_offering_id;
  return v_count;
end;
$$;

-- Service-role refund sync. Safely decrements capacity only once when a confirmed place is refunded.
create or replace function public.system_update_group_refund(
  p_enrollment_id uuid,
  p_refund_id text,
  p_refund_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.group_enrollments%rowtype;
  v_succeeded boolean := p_refund_status = 'succeeded';
begin
  select * into v_enrollment from public.group_enrollments where id = p_enrollment_id for update;
  if not found then return; end if;

  if v_succeeded and v_enrollment.status = 'confirmed' then
    update public.group_offerings set confirmed_count = greatest(0, confirmed_count - 1), updated_at = now()
    where id = v_enrollment.offering_id;
  end if;

  update public.group_enrollments
  set stripe_refund_id = p_refund_id,
      refund_status = p_refund_status,
      refunded_at = case when v_succeeded then coalesce(refunded_at, now()) else refunded_at end,
      payment_status = case when v_succeeded then 'refunded' else payment_status end,
      status = case when v_succeeded then 'refunded' else status end,
      cancelled_at = case when v_succeeded then coalesce(cancelled_at, now()) else cancelled_at end
  where id = p_enrollment_id;
end;
$$;

-- Owner cancellation before the first session. Stripe refund is performed by the server first.
create or replace function public.cancel_group_enrollment(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.group_enrollments%rowtype;
  v_first_start timestamptz;
begin
  select * into v_enrollment from public.group_enrollments where id = p_enrollment_id for update;
  if not found or v_enrollment.customer_id <> v_user_id then raise exception 'Påmeldingen finnes ikke.'; end if;
  if v_enrollment.status in ('cancelled','refunded') then return; end if;
  if v_enrollment.status not in ('checkout_pending','confirmed') then raise exception 'Påmeldingen kan ikke avbestilles.'; end if;

  select min(starts_at) into v_first_start from public.group_sessions where offering_id = v_enrollment.offering_id;
  if v_first_start is not null and v_first_start <= now() then raise exception 'Kurset eller arrangementet har allerede startet.'; end if;

  if v_enrollment.status = 'confirmed' then
    update public.group_offerings set confirmed_count = greatest(0, confirmed_count - 1), updated_at = now() where id = v_enrollment.offering_id;
  end if;

  update public.group_enrollments
  set status = case when payment_status = 'refunded' then 'refunded' else 'cancelled' end,
      cancelled_at = now()
  where id = p_enrollment_id;
end;
$$;

grant execute on function public.can_read_group_offering(uuid) to public;

revoke execute on function public.create_group_checkout_enrollment(uuid, uuid, text) from public, anon;
grant execute on function public.create_group_checkout_enrollment(uuid, uuid, text) to authenticated;
revoke execute on function public.cancel_group_enrollment(uuid) from public, anon;
grant execute on function public.cancel_group_enrollment(uuid) to authenticated;
revoke execute on function public.complete_group_offering(uuid) from public, anon;
grant execute on function public.complete_group_offering(uuid) to authenticated;
revoke execute on function public.system_confirm_group_enrollment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.system_expire_group_checkout(uuid) from public, anon, authenticated;
revoke execute on function public.system_update_group_refund(uuid, text, text) from public, anon, authenticated;
grant execute on function public.system_confirm_group_enrollment(uuid, text, text) to service_role;
grant execute on function public.system_expire_group_checkout(uuid) to service_role;
grant execute on function public.system_update_group_refund(uuid, text, text) to service_role;
