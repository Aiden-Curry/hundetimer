-- MVP v19: fair waiting lists for full group courses/events
-- Run after saved-items-upgrade.sql (v18).

create table if not exists public.group_waitlist (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.group_offerings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,
  dog_name text not null,
  customer_note text,
  status text not null default 'waiting' check (status in ('waiting','offered','checkout','booked','withdrawn','expired','cancelled')),
  joined_at timestamptz not null default now(),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  offer_notified_at timestamptz,
  converted_enrollment_id uuid references public.group_enrollments(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists group_waitlist_offering_queue_idx
  on public.group_waitlist(offering_id, status, joined_at);
create index if not exists group_waitlist_customer_idx
  on public.group_waitlist(customer_id, joined_at desc);
create unique index if not exists group_waitlist_active_dog_uidx
  on public.group_waitlist(offering_id, dog_id)
  where dog_id is not null and status in ('waiting','offered','checkout');
create unique index if not exists group_waitlist_active_customer_uidx
  on public.group_waitlist(offering_id, customer_id)
  where status in ('waiting','offered','checkout');

alter table public.group_waitlist enable row level security;

drop policy if exists "group_waitlist_owner_read" on public.group_waitlist;
drop policy if exists "group_waitlist_trainer_read" on public.group_waitlist;
drop policy if exists "group_waitlist_admin_read" on public.group_waitlist;
create policy "group_waitlist_owner_read" on public.group_waitlist
  for select to authenticated using (customer_id = auth.uid());
create policy "group_waitlist_trainer_read" on public.group_waitlist
  for select to authenticated using (exists (
    select 1 from public.group_offerings o where o.id = offering_id and o.trainer_id = auth.uid()
  ));
create policy "group_waitlist_admin_read" on public.group_waitlist
  for select to authenticated using (public.is_current_user_admin());

-- Waiting owners keep read access to the activity even if the trainer temporarily hides it.
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
        (o.active = true and public.is_trainer_verified(o.trainer_id))
        or o.trainer_id = auth.uid()
        or public.is_current_user_admin()
        or exists (select 1 from public.group_enrollments e where e.offering_id = o.id and e.customer_id = auth.uid())
        or exists (select 1 from public.group_waitlist w where w.offering_id = o.id and w.customer_id = auth.uid())
      )
  );
$$;
grant execute on function public.can_read_group_offering(uuid) to public;

-- Public-safe count of places that are actually bookable right now. Active checkout
-- reservations and 24-hour priority offers both reserve capacity.
create or replace function public.group_available_places(p_offering_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, o.capacity
    - (select count(*)::integer from public.group_enrollments e
       where e.offering_id = o.id and (
         e.status = 'confirmed'
         or (e.status = 'checkout_pending' and (e.checkout_expires_at is null or e.checkout_expires_at > now()))
       ))
    - (select count(*)::integer from public.group_waitlist w
       where w.offering_id = o.id and w.status = 'offered' and w.offer_expires_at > now())
  )
  from public.group_offerings o
  where o.id = p_offering_id and public.can_read_group_offering(o.id);
$$;

grant execute on function public.group_available_places(uuid) to public;

-- Internal helper. Fills every currently free seat from the queue in FIFO order.
-- Each offer gets a 24-hour priority window, capped at the first session start.
create or replace function public.system_promote_group_waitlist(p_offering_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offering public.group_offerings%rowtype;
  v_first_start timestamptz;
  v_reserved integer;
  v_offered integer;
  v_available integer;
  v_wait public.group_waitlist%rowtype;
  v_promoted integer := 0;
  v_expiry timestamptz;
begin
  select * into v_offering from public.group_offerings where id = p_offering_id for update;
  if not found or not v_offering.active or v_offering.completed_at is not null then return 0; end if;
  if not public.is_trainer_verified(v_offering.trainer_id) then return 0; end if;

  select min(starts_at) into v_first_start from public.group_sessions where offering_id = p_offering_id;
  if v_first_start is null or v_first_start <= now() then return 0; end if;

  -- Expired priority offers no longer reserve a place.
  update public.group_waitlist
  set status = 'expired', updated_at = now()
  where offering_id = p_offering_id and status = 'offered'
    and offer_expires_at is not null and offer_expires_at <= now();

  -- Stale Stripe reservations should not block the queue forever. If the
  -- reservation came from a priority offer, return it to that offer while valid.
  update public.group_waitlist w
  set status = case when w.offer_expires_at > now() then 'offered' else 'expired' end,
      converted_enrollment_id = null, updated_at = now()
  from public.group_enrollments e
  where w.converted_enrollment_id = e.id and w.status = 'checkout'
    and e.offering_id = p_offering_id and e.status = 'checkout_pending'
    and e.checkout_expires_at is not null and e.checkout_expires_at <= now();

  update public.group_enrollments
  set status = 'cancelled', payment_status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where offering_id = p_offering_id and status = 'checkout_pending'
    and checkout_expires_at is not null and checkout_expires_at <= now();

  select count(*)::integer into v_reserved
  from public.group_enrollments
  where offering_id = p_offering_id and (
    status = 'confirmed'
    or (status = 'checkout_pending' and (checkout_expires_at is null or checkout_expires_at > now()))
  );

  select count(*)::integer into v_offered
  from public.group_waitlist
  where offering_id = p_offering_id and status = 'offered' and offer_expires_at > now();

  v_available := greatest(0, v_offering.capacity - v_reserved - v_offered);

  while v_available > 0 loop
    select * into v_wait
    from public.group_waitlist
    where offering_id = p_offering_id and status = 'waiting'
    order by joined_at, id
    for update skip locked
    limit 1;
    exit when not found;

    v_expiry := least(now() + interval '24 hours', v_first_start);
    if v_expiry <= now() then exit; end if;

    update public.group_waitlist
    set status = 'offered', offered_at = now(), offer_expires_at = v_expiry,
        offer_notified_at = null, updated_at = now()
    where id = v_wait.id;

    v_available := v_available - 1;
    v_promoted := v_promoted + 1;
  end loop;

  return v_promoted;
end;
$$;

revoke execute on function public.system_promote_group_waitlist(uuid) from public, anon, authenticated;
grant execute on function public.system_promote_group_waitlist(uuid) to service_role;

create or replace function public.join_group_waitlist(
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
  v_first_start timestamptz;
  v_available integer;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Du må være logget inn.'; end if;

  select * into v_offering from public.group_offerings where id = p_offering_id for update;
  if not found or not v_offering.active or v_offering.completed_at is not null
     or not public.is_trainer_verified(v_offering.trainer_id) then
    raise exception 'Kurset eller arrangementet er ikke tilgjengelig.';
  end if;
  if v_offering.trainer_id = v_user_id then raise exception 'Du kan ikke stå på venteliste til ditt eget arrangement.'; end if;

  select * into v_dog from public.dogs where id = p_dog_id and owner_id = v_user_id;
  if not found then raise exception 'Velg en av hundene dine.'; end if;

  select min(starts_at) into v_first_start from public.group_sessions where offering_id = p_offering_id;
  if v_first_start is null or v_first_start <= now() then raise exception 'Ventelisten er stengt fordi aktiviteten har startet.'; end if;

  if exists (
    select 1 from public.group_enrollments
    where offering_id = p_offering_id and dog_id = p_dog_id and status in ('checkout_pending','confirmed')
  ) then raise exception 'Denne hunden er allerede påmeldt.'; end if;

  if exists (
    select 1 from public.group_waitlist
    where offering_id = p_offering_id and customer_id = v_user_id and status in ('waiting','offered','checkout')
  ) then raise exception 'Du står allerede på ventelisten til denne aktiviteten.'; end if;

  if exists (
    select 1 from public.group_waitlist
    where offering_id = p_offering_id and dog_id = p_dog_id and status in ('waiting','offered','checkout')
  ) then raise exception 'Denne hunden står allerede på ventelisten.'; end if;

  perform public.system_promote_group_waitlist(p_offering_id);
  v_available := public.group_available_places(p_offering_id);
  if coalesce(v_available, 0) > 0 then
    raise exception 'Det er ledig plass nå. Meld hunden på direkte i stedet.';
  end if;

  insert into public.group_waitlist(offering_id, customer_id, dog_id, dog_name, customer_note)
  values (p_offering_id, v_user_id, v_dog.id, v_dog.name, nullif(trim(coalesce(p_customer_note,'')),''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.join_group_waitlist(uuid, uuid, text) from public, anon;
grant execute on function public.join_group_waitlist(uuid, uuid, text) to authenticated;

create or replace function public.withdraw_group_waitlist(p_waitlist_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.group_waitlist%rowtype;
  v_should_promote boolean := false;
begin
  select * into v_entry from public.group_waitlist where id = p_waitlist_id for update;
  if not found or v_entry.customer_id <> v_user_id then raise exception 'Ventelisteplassen finnes ikke.'; end if;
  if v_entry.status in ('withdrawn','expired','cancelled') then return; end if;
  if v_entry.status = 'booked' then raise exception 'Du er allerede påmeldt. Avbestill påmeldingen i stedet.'; end if;
  if v_entry.status = 'checkout' then raise exception 'Avbryt betalingen før du forlater ventelisten.'; end if;

  v_should_promote := v_entry.status = 'offered';
  update public.group_waitlist set status = 'withdrawn', updated_at = now() where id = p_waitlist_id;
  if v_should_promote then perform public.system_promote_group_waitlist(v_entry.offering_id); end if;
end;
$$;

revoke execute on function public.withdraw_group_waitlist(uuid) from public, anon;
grant execute on function public.withdraw_group_waitlist(uuid) to authenticated;

-- Position is intentionally available only to the owner of that queue entry, its trainer, or admin.
create or replace function public.group_waitlist_position(p_waitlist_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entry public.group_waitlist%rowtype;
  v_trainer uuid;
  v_position integer;
begin
  select * into v_entry from public.group_waitlist where id = p_waitlist_id;
  if not found then return null; end if;
  select trainer_id into v_trainer from public.group_offerings where id = v_entry.offering_id;
  if auth.uid() <> v_entry.customer_id and auth.uid() <> v_trainer and not public.is_current_user_admin() then return null; end if;
  if v_entry.status <> 'waiting' then return null; end if;
  select count(*)::integer + 1 into v_position
  from public.group_waitlist w
  where w.offering_id = v_entry.offering_id and w.status = 'waiting'
    and (w.joined_at < v_entry.joined_at or (w.joined_at = v_entry.joined_at and w.id < v_entry.id));
  return v_position;
end;
$$;

grant execute on function public.group_waitlist_position(uuid) to authenticated;

-- Replace checkout creation so a valid priority offer can claim its reserved seat.
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
  v_offered integer;
  v_enrollment_id uuid;
  v_platform_fee integer;
  v_first_start timestamptz;
  v_wait public.group_waitlist%rowtype;
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

  update public.group_enrollments
  set status = 'cancelled', payment_status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where offering_id = p_offering_id and status = 'checkout_pending'
    and checkout_expires_at is not null and checkout_expires_at <= now();

  perform public.system_promote_group_waitlist(p_offering_id);

  if exists (
    select 1 from public.group_enrollments
    where offering_id = p_offering_id and dog_id = p_dog_id and status in ('checkout_pending','confirmed')
  ) then raise exception 'Denne hunden er allerede påmeldt.'; end if;

  select * into v_wait from public.group_waitlist
  where offering_id = p_offering_id and customer_id = v_user_id and dog_id = p_dog_id
    and status = 'offered' and offer_expires_at > now()
  order by offered_at desc limit 1 for update;

  select count(*)::integer into v_reserved
  from public.group_enrollments
  where offering_id = p_offering_id and (
    status = 'confirmed'
    or (status = 'checkout_pending' and (checkout_expires_at is null or checkout_expires_at > now()))
  );
  select count(*)::integer into v_offered
  from public.group_waitlist
  where offering_id = p_offering_id and status = 'offered' and offer_expires_at > now();

  if v_wait.id is null and v_reserved + v_offered >= v_offering.capacity then
    raise exception 'Det er fullt. Bli med på ventelisten for å få neste ledige plass.';
  end if;

  v_platform_fee := ceil(v_offering.price_nok * 0.075)::integer;
  insert into public.group_enrollments (
    offering_id, customer_id, dog_id, dog_name, customer_note,
    subtotal_nok, service_fee_nok, platform_fee_nok, checkout_expires_at
  ) values (
    p_offering_id, v_user_id, v_dog.id, v_dog.name, nullif(trim(coalesce(p_customer_note, '')), ''),
    v_offering.price_nok, 29, v_platform_fee, now() + interval '35 minutes'
  ) returning id into v_enrollment_id;

  if v_wait.id is not null then
    update public.group_waitlist
    set status = 'checkout', converted_enrollment_id = v_enrollment_id, updated_at = now()
    where id = v_wait.id;
  end if;

  return v_enrollment_id;
end;
$$;

-- Confirmation consumes a waitlist offer permanently.
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
  if v_enrollment.status in ('confirmed','completed') then return; end if;
  if v_enrollment.status <> 'checkout_pending' then return; end if;

  update public.group_enrollments
  set status = 'confirmed', payment_status = 'captured', stripe_payment_intent_id = p_payment_intent_id,
      stripe_checkout_session_id = p_checkout_session_id, paid_at = now(), checkout_expires_at = null
  where id = p_enrollment_id;

  update public.group_waitlist
  set status = 'booked', updated_at = now()
  where converted_enrollment_id = p_enrollment_id and status = 'checkout';

  update public.group_offerings set confirmed_count = confirmed_count + 1, updated_at = now()
  where id = v_enrollment.offering_id;
end;
$$;

-- Checkout cancellation/expiry returns a priority customer to their offer when it is
-- still valid. Otherwise the offer expires and the next person is promoted.
create or replace function public.system_expire_group_checkout(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.group_enrollments%rowtype;
  v_wait public.group_waitlist%rowtype;
  v_reoffered boolean := false;
begin
  select * into v_enrollment from public.group_enrollments where id = p_enrollment_id for update;
  if not found or v_enrollment.status <> 'checkout_pending' then return; end if;

  update public.group_enrollments
  set status = 'cancelled', payment_status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where id = p_enrollment_id;

  select * into v_wait from public.group_waitlist
  where converted_enrollment_id = p_enrollment_id and status = 'checkout'
  for update;

  if found then
    if v_wait.offer_expires_at is not null and v_wait.offer_expires_at > now() then
      update public.group_waitlist set status = 'offered', converted_enrollment_id = null, updated_at = now() where id = v_wait.id;
      v_reoffered := true;
    else
      update public.group_waitlist set status = 'expired', converted_enrollment_id = null, updated_at = now() where id = v_wait.id;
    end if;
  end if;

  if not v_reoffered then perform public.system_promote_group_waitlist(v_enrollment.offering_id); end if;
end;
$$;

-- Refunds/cancellations reopen capacity and mark any historical waitlist conversion cancelled.
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

  if v_succeeded then
    update public.group_waitlist set status = 'cancelled', updated_at = now()
    where converted_enrollment_id = p_enrollment_id and status = 'booked';
    perform public.system_promote_group_waitlist(v_enrollment.offering_id);
  end if;
end;
$$;

-- Expire all elapsed priority windows and immediately offer freed places to the next people.
create or replace function public.system_expire_group_waitlist_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_changed integer := 0;
  r record;
begin
  for r in select distinct offering_id from public.group_waitlist
    where status = 'offered' and offer_expires_at is not null and offer_expires_at <= now()
  loop
    update public.group_waitlist set status = 'expired', updated_at = now()
    where offering_id = r.offering_id and status = 'offered' and offer_expires_at <= now();
    get diagnostics v_changed = row_count;
    v_count := v_count + v_changed;
    perform public.system_promote_group_waitlist(r.offering_id);
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.system_confirm_group_enrollment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.system_expire_group_checkout(uuid) from public, anon, authenticated;
revoke execute on function public.system_update_group_refund(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.system_expire_group_waitlist_offers() from public, anon, authenticated;
grant execute on function public.system_confirm_group_enrollment(uuid, text, text) to service_role;
grant execute on function public.system_expire_group_checkout(uuid) to service_role;
grant execute on function public.system_update_group_refund(uuid, text, text) to service_role;
grant execute on function public.system_expire_group_waitlist_offers() to service_role;

-- Trainer increasing capacity should immediately reserve new seats for the queue.
create or replace function public.promote_waitlist_after_capacity_increase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capacity > old.capacity then perform public.system_promote_group_waitlist(new.id); end if;
  return new;
end;
$$;

drop trigger if exists promote_group_waitlist_capacity on public.group_offerings;
create trigger promote_group_waitlist_capacity
after update of capacity on public.group_offerings
for each row execute function public.promote_waitlist_after_capacity_increase();


-- Never let a trainer shrink capacity below seats that are already confirmed,
-- in Stripe Checkout, or reserved by an active waitlist offer.
create or replace function public.guard_group_capacity_reservations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved integer;
begin
  if new.capacity >= old.capacity then return new; end if;
  select
    (select count(*)::integer from public.group_enrollments e
      where e.offering_id = new.id and (
        e.status = 'confirmed'
        or (e.status = 'checkout_pending' and (e.checkout_expires_at is null or e.checkout_expires_at > now()))
      ))
    +
    (select count(*)::integer from public.group_waitlist w
      where w.offering_id = new.id and w.status = 'offered' and w.offer_expires_at > now())
  into v_reserved;
  if new.capacity < coalesce(v_reserved, 0) then
    raise exception 'Kapasiteten kan ikke settes lavere enn % reserverte eller bekreftede plasser.', v_reserved;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_group_capacity_waitlist on public.group_offerings;
create trigger guard_group_capacity_waitlist
before update of capacity on public.group_offerings
for each row execute function public.guard_group_capacity_reservations();
