-- MVP v22: trainer promo codes and campaigns

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  name text not null,
  code text not null,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value integer not null check (discount_value > 0),
  applies_to text not null default 'all' check (applies_to in ('all','private','group','online_course')),
  target_id uuid,
  minimum_subtotal_nok integer not null default 0 check (minimum_subtotal_nok >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_redemptions_per_customer integer not null default 1 check (max_redemptions_per_customer > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_percent_value check (discount_type <> 'percent' or discount_value <= 100),
  constraint promotions_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index if not exists promotions_trainer_code_unique
  on public.promotions (trainer_id, lower(code));
create index if not exists promotions_active_idx on public.promotions(trainer_id, active);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  purchase_type text not null check (purchase_type in ('booking','group','online_course')),
  booking_id uuid references public.bookings(id) on delete cascade,
  group_enrollment_id uuid references public.group_enrollments(id) on delete cascade,
  online_course_purchase_id uuid references public.online_course_purchases(id) on delete cascade,
  discount_nok integer not null check (discount_nok >= 0),
  status text not null default 'reserved' check (status in ('reserved','redeemed','released')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  released_at timestamptz,
  constraint promotion_redemptions_one_purchase check (
    ((booking_id is not null)::int + (group_enrollment_id is not null)::int + (online_course_purchase_id is not null)::int) = 1
  )
);
create unique index if not exists promotion_redemption_booking_unique on public.promotion_redemptions(booking_id) where booking_id is not null;
create unique index if not exists promotion_redemption_group_unique on public.promotion_redemptions(group_enrollment_id) where group_enrollment_id is not null;
create unique index if not exists promotion_redemption_online_unique on public.promotion_redemptions(online_course_purchase_id) where online_course_purchase_id is not null;
create index if not exists promotion_redemptions_promotion_status_idx on public.promotion_redemptions(promotion_id, status);
create index if not exists promotion_redemptions_customer_idx on public.promotion_redemptions(promotion_id, customer_id, status);

alter table public.bookings add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.bookings add column if not exists promotion_code text;
alter table public.bookings add column if not exists original_subtotal_nok integer;
alter table public.bookings add column if not exists discount_nok integer not null default 0 check (discount_nok >= 0);

alter table public.group_enrollments add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.group_enrollments add column if not exists promotion_code text;
alter table public.group_enrollments add column if not exists original_subtotal_nok integer;
alter table public.group_enrollments add column if not exists discount_nok integer not null default 0 check (discount_nok >= 0);

alter table public.online_course_purchases add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.online_course_purchases add column if not exists promotion_code text;
alter table public.online_course_purchases add column if not exists original_subtotal_nok integer;
alter table public.online_course_purchases add column if not exists discount_nok integer not null default 0 check (discount_nok >= 0);

alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;

drop policy if exists "promotions_trainer_select" on public.promotions;
create policy "promotions_trainer_select" on public.promotions for select to authenticated
  using (trainer_id = auth.uid());
drop policy if exists "promotions_trainer_insert" on public.promotions;
create policy "promotions_trainer_insert" on public.promotions for insert to authenticated
  with check (trainer_id = auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='trainer'));
drop policy if exists "promotions_trainer_update" on public.promotions;
create policy "promotions_trainer_update" on public.promotions for update to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
drop policy if exists "promotions_trainer_delete" on public.promotions;
create policy "promotions_trainer_delete" on public.promotions for delete to authenticated
  using (trainer_id = auth.uid());

drop policy if exists "promotion_redemptions_trainer_select" on public.promotion_redemptions;
create policy "promotion_redemptions_trainer_select" on public.promotion_redemptions for select to authenticated
  using (exists(select 1 from public.promotions p where p.id=promotion_id and p.trainer_id=auth.uid()));

-- Public/authenticated preview. Returns only safe campaign facts, never customer/redemption rows.
create or replace function public.preview_promotion(
  p_purchase_type text,
  p_item_id uuid,
  p_code text
)
returns table(
  promotion_id uuid,
  promotion_name text,
  code text,
  original_subtotal_nok integer,
  discount_nok integer,
  discounted_subtotal_nok integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_subtotal integer;
  v_promo public.promotions%rowtype;
  v_count integer;
  v_customer_count integer := 0;
  v_customer uuid := auth.uid();
  v_scope text;
begin
  if nullif(trim(coalesce(p_code,'')),'') is null then return; end if;

  v_scope := case when p_purchase_type='booking' then 'private' else p_purchase_type end;

  if p_purchase_type = 'booking' then
    select s.trainer_id, s.price_nok into v_trainer_id, v_subtotal from public.services s where s.id=p_item_id and s.active=true;
  elsif p_purchase_type = 'group' then
    select g.trainer_id, g.price_nok into v_trainer_id, v_subtotal from public.group_offerings g where g.id=p_item_id and g.active=true and g.completed_at is null;
  elsif p_purchase_type = 'online_course' then
    select c.trainer_id, c.price_nok into v_trainer_id, v_subtotal from public.online_courses c where c.id=p_item_id and c.published=true;
  else
    raise exception 'Ugyldig produkttype.';
  end if;
  if v_trainer_id is null then return; end if;
  if not exists (select 1 from public.trainer_profiles t where t.id=v_trainer_id and t.verified=true) then return; end if;

  select * into v_promo from public.promotions p
  where p.trainer_id=v_trainer_id and lower(p.code)=lower(trim(p_code)) and p.active=true
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at > now())
    and (p.applies_to='all' or p.applies_to=v_scope)
    and (p.target_id is null or p.target_id=p_item_id)
  limit 1;
  if not found then return; end if;
  if v_subtotal < v_promo.minimum_subtotal_nok then return; end if;

  select count(*)::integer into v_count from public.promotion_redemptions r
    where r.promotion_id=v_promo.id and r.status in ('reserved','redeemed');
  if v_promo.max_redemptions is not null and v_count >= v_promo.max_redemptions then return; end if;

  if v_customer is not null then
    select count(*)::integer into v_customer_count from public.promotion_redemptions r
      where r.promotion_id=v_promo.id and r.customer_id=v_customer and r.status in ('reserved','redeemed');
    if v_customer_count >= v_promo.max_redemptions_per_customer then return; end if;
  end if;

  promotion_id := v_promo.id;
  promotion_name := v_promo.name;
  code := upper(v_promo.code);
  original_subtotal_nok := v_subtotal;
  discount_nok := case when v_promo.discount_type='percent'
    then floor(v_subtotal * v_promo.discount_value / 100.0)::integer
    else least(v_subtotal, v_promo.discount_value) end;
  discounted_subtotal_nok := greatest(0, v_subtotal - discount_nok);
  return next;
end;
$$;

revoke execute on function public.preview_promotion(text,uuid,text) from public;
grant execute on function public.preview_promotion(text,uuid,text) to anon, authenticated;

-- Service-role function: atomically validates, reserves and snapshots a promotion on a pending checkout row.
create or replace function public.apply_promotion_to_purchase(
  p_purchase_type text,
  p_purchase_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_trainer uuid;
  v_item uuid;
  v_original integer;
  v_promo public.promotions%rowtype;
  v_total_count integer;
  v_customer_count integer;
  v_discount integer;
  v_discounted integer;
  v_platform_fee integer;
  v_scope text;
begin
  if nullif(trim(coalesce(p_code,'')),'') is null then return null; end if;
  v_scope := case when p_purchase_type='booking' then 'private' else p_purchase_type end;

  if p_purchase_type='booking' then
    select b.customer_id,b.trainer_id,b.service_id,coalesce(b.original_subtotal_nok,b.subtotal_nok)
      into v_customer,v_trainer,v_item,v_original from public.bookings b where b.id=p_purchase_id for update;
  elsif p_purchase_type='group' then
    select e.customer_id,g.trainer_id,e.offering_id,coalesce(e.original_subtotal_nok,e.subtotal_nok)
      into v_customer,v_trainer,v_item,v_original from public.group_enrollments e join public.group_offerings g on g.id=e.offering_id where e.id=p_purchase_id for update of e;
  elsif p_purchase_type='online_course' then
    select p.customer_id,c.trainer_id,p.course_id,coalesce(p.original_subtotal_nok,p.subtotal_nok)
      into v_customer,v_trainer,v_item,v_original from public.online_course_purchases p join public.online_courses c on c.id=p.course_id where p.id=p_purchase_id for update of p;
  else
    raise exception 'Ugyldig produkttype.';
  end if;
  if v_customer is null then raise exception 'Fant ikke kjøpet.'; end if;
  if not exists (select 1 from public.trainer_profiles t where t.id=v_trainer and t.verified=true) then raise exception 'Treneren er ikke tilgjengelig for nye kjøp.'; end if;

  select * into v_promo from public.promotions p
  where p.trainer_id=v_trainer and lower(p.code)=lower(trim(p_code)) and p.active=true
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at > now())
    and (p.applies_to='all' or p.applies_to=v_scope)
    and (p.target_id is null or p.target_id=v_item)
  for update limit 1;
  if not found then raise exception 'Rabattkoden er ugyldig eller ikke aktiv.'; end if;
  if v_original < v_promo.minimum_subtotal_nok then raise exception 'Bestillingen når ikke minimumsbeløpet for rabattkoden.'; end if;

  select count(*)::integer into v_total_count from public.promotion_redemptions r
    where r.promotion_id=v_promo.id and r.status in ('reserved','redeemed');
  if v_promo.max_redemptions is not null and v_total_count >= v_promo.max_redemptions then
    raise exception 'Rabattkoden har nådd maks antall bruk.';
  end if;
  select count(*)::integer into v_customer_count from public.promotion_redemptions r
    where r.promotion_id=v_promo.id and r.customer_id=v_customer and r.status in ('reserved','redeemed');
  if v_customer_count >= v_promo.max_redemptions_per_customer then raise exception 'Du har allerede brukt denne rabattkoden.'; end if;

  v_discount := case when v_promo.discount_type='percent'
    then floor(v_original * v_promo.discount_value / 100.0)::integer
    else least(v_original, v_promo.discount_value) end;
  v_discounted := greatest(0, v_original-v_discount);
  v_platform_fee := ceil(v_discounted * 0.075)::integer;

  if p_purchase_type='booking' then
    update public.bookings set original_subtotal_nok=v_original, subtotal_nok=v_discounted, discount_nok=v_discount,
      platform_fee_nok=v_platform_fee, promotion_id=v_promo.id, promotion_code=upper(v_promo.code) where id=p_purchase_id;
    insert into public.promotion_redemptions(promotion_id,customer_id,purchase_type,booking_id,discount_nok)
      values(v_promo.id,v_customer,'booking',p_purchase_id,v_discount);
  elsif p_purchase_type='group' then
    update public.group_enrollments set original_subtotal_nok=v_original, subtotal_nok=v_discounted, discount_nok=v_discount,
      platform_fee_nok=v_platform_fee, promotion_id=v_promo.id, promotion_code=upper(v_promo.code) where id=p_purchase_id;
    insert into public.promotion_redemptions(promotion_id,customer_id,purchase_type,group_enrollment_id,discount_nok)
      values(v_promo.id,v_customer,'group',p_purchase_id,v_discount);
  else
    update public.online_course_purchases set original_subtotal_nok=v_original, subtotal_nok=v_discounted, discount_nok=v_discount,
      platform_fee_nok=v_platform_fee, promotion_id=v_promo.id, promotion_code=upper(v_promo.code) where id=p_purchase_id;
    insert into public.promotion_redemptions(promotion_id,customer_id,purchase_type,online_course_purchase_id,discount_nok)
      values(v_promo.id,v_customer,'online_course',p_purchase_id,v_discount);
  end if;

  return jsonb_build_object('promotion_id',v_promo.id,'code',upper(v_promo.code),'discount_nok',v_discount,'subtotal_nok',v_discounted);
end;
$$;

create or replace function public.release_promotion_for_purchase(p_purchase_type text, p_purchase_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_purchase_type='booking' then
    update public.promotion_redemptions set status='released', released_at=now()
      where booking_id=p_purchase_id and status='reserved';
  elsif p_purchase_type='group' then
    update public.promotion_redemptions set status='released', released_at=now()
      where group_enrollment_id=p_purchase_id and status='reserved';
  elsif p_purchase_type='online_course' then
    update public.promotion_redemptions set status='released', released_at=now()
      where online_course_purchase_id=p_purchase_id and status='reserved';
  end if;
end; $$;

create or replace function public.redeem_promotion_for_purchase(p_purchase_type text, p_purchase_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_purchase_type='booking' then
    update public.promotion_redemptions set status='redeemed', redeemed_at=now()
      where booking_id=p_purchase_id and status='reserved';
  elsif p_purchase_type='group' then
    update public.promotion_redemptions set status='redeemed', redeemed_at=now()
      where group_enrollment_id=p_purchase_id and status='reserved';
  elsif p_purchase_type='online_course' then
    update public.promotion_redemptions set status='redeemed', redeemed_at=now()
      where online_course_purchase_id=p_purchase_id and status='reserved';
  end if;
end; $$;

revoke execute on function public.apply_promotion_to_purchase(text,uuid,text) from public, anon, authenticated;
revoke execute on function public.release_promotion_for_purchase(text,uuid) from public, anon, authenticated;
revoke execute on function public.redeem_promotion_for_purchase(text,uuid) from public, anon, authenticated;
grant execute on function public.apply_promotion_to_purchase(text,uuid,text) to service_role;
grant execute on function public.release_promotion_for_purchase(text,uuid) to service_role;
grant execute on function public.redeem_promotion_for_purchase(text,uuid) to service_role;
