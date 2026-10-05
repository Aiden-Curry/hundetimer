-- MVP v26: trainer planner, external clients, manual appointments and manual class participants.
-- Run after the v25 privacy/account migration.

create table if not exists public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trainer_clients_trainer_name_idx on public.trainer_clients(trainer_id, name);

create table if not exists public.trainer_client_dogs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  client_id uuid not null references public.trainer_clients(id) on delete cascade,
  name text not null,
  breed text,
  birth_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trainer_client_dogs_client_idx on public.trainer_client_dogs(client_id, name);

create table if not exists public.external_appointments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  client_id uuid references public.trainer_clients(id) on delete set null,
  dog_id uuid references public.trainer_client_dogs(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'other' check (source in ('phone','facebook','email','direct','other')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid_external','free')),
  price_nok integer not null default 0 check (price_nok >= 0),
  notes text,
  sync_to_calendar boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists external_appointments_trainer_dates_idx on public.external_appointments(trainer_id, starts_at, ends_at);

create table if not exists public.external_appointment_calendar_events (
  appointment_id uuid primary key references public.external_appointments(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  external_event_id text not null,
  external_calendar_id text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_manual_participants (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.group_offerings(id) on delete cascade,
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  client_id uuid references public.trainer_clients(id) on delete set null,
  dog_id uuid references public.trainer_client_dogs(id) on delete set null,
  customer_name text not null,
  dog_name text not null,
  source text not null default 'other' check (source in ('phone','facebook','email','direct','other')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid_external','free')),
  price_nok integer not null default 0 check (price_nok >= 0),
  notes text,
  status text not null default 'active' check (status in ('active','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists group_manual_participants_offering_idx on public.group_manual_participants(offering_id, status);

alter table public.trainer_clients enable row level security;
alter table public.trainer_client_dogs enable row level security;
alter table public.external_appointments enable row level security;
alter table public.external_appointment_calendar_events enable row level security;
alter table public.group_manual_participants enable row level security;

-- Trainer CRM is private to that trainer. Admin can read for support/moderation.
drop policy if exists trainer_clients_own_all on public.trainer_clients;
create policy trainer_clients_own_all on public.trainer_clients for all to authenticated
  using (trainer_id = auth.uid() or public.is_current_user_admin())
  with check (trainer_id = auth.uid() or public.is_current_user_admin());

drop policy if exists trainer_client_dogs_own_all on public.trainer_client_dogs;
create policy trainer_client_dogs_own_all on public.trainer_client_dogs for all to authenticated
  using (trainer_id = auth.uid() or public.is_current_user_admin())
  with check (trainer_id = auth.uid() or public.is_current_user_admin());

drop policy if exists external_appointments_own_all on public.external_appointments;
drop policy if exists external_appointments_read_own on public.external_appointments;
create policy external_appointments_read_own on public.external_appointments for select to authenticated
  using (trainer_id = auth.uid() or public.is_current_user_admin());
revoke insert, update, delete on public.external_appointments from anon, authenticated;

drop policy if exists external_appointment_calendar_events_read_own on public.external_appointment_calendar_events;
create policy external_appointment_calendar_events_read_own on public.external_appointment_calendar_events for select to authenticated
  using (trainer_id = auth.uid() or public.is_current_user_admin());
revoke insert, update, delete on public.external_appointment_calendar_events from anon, authenticated;

drop policy if exists group_manual_participants_own_all on public.group_manual_participants;
drop policy if exists group_manual_participants_read_own on public.group_manual_participants;
create policy group_manual_participants_read_own on public.group_manual_participants for select to authenticated
  using (trainer_id = auth.uid() or public.is_current_user_admin());
revoke insert, update, delete on public.group_manual_participants from anon, authenticated;

-- Manual outside appointments are created atomically so they can never silently
-- overlap a held/booked marketplace appointment, a group session, a manual block,
-- another outside appointment, or imported busy time.
create or replace function public.create_external_appointment(
  p_client_id uuid,
  p_dog_id uuid,
  p_service_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_source text default 'other',
  p_payment_status text default 'unpaid',
  p_price_nok integer default 0,
  p_notes text default null,
  p_sync_to_calendar boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid := auth.uid();
  v_id uuid;
begin
  if v_trainer_id is null then raise exception 'Du må være logget inn.'; end if;
  if not exists (select 1 from public.trainer_profiles t where t.id = v_trainer_id) then raise exception 'Kun trenere kan opprette avtaler.'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Sluttiden må være etter starttiden.'; end if;
  if p_starts_at < now() - interval '1 day' then raise exception 'Tidspunktet er for langt tilbake i tid.'; end if;
  if p_source not in ('phone','facebook','email','direct','other') then raise exception 'Ugyldig bestillingskilde.'; end if;
  if p_payment_status not in ('unpaid','paid_external','free') then raise exception 'Ugyldig betalingsstatus.'; end if;
  if coalesce(p_price_nok,0) < 0 then raise exception 'Pris kan ikke være negativ.'; end if;
  if p_client_id is not null and not exists (select 1 from public.trainer_clients c where c.id=p_client_id and c.trainer_id=v_trainer_id) then raise exception 'Kunden finnes ikke.'; end if;
  if p_dog_id is not null and not exists (select 1 from public.trainer_client_dogs d where d.id=p_dog_id and d.trainer_id=v_trainer_id and (p_client_id is null or d.client_id=p_client_id)) then raise exception 'Hunden finnes ikke.'; end if;
  if p_service_id is not null and not exists (select 1 from public.services s where s.id=p_service_id and s.trainer_id=v_trainer_id) then raise exception 'Tjenesten finnes ikke.'; end if;

  if exists (select 1 from public.availability_slots s where s.trainer_id=v_trainer_id and s.status in ('held','booked') and s.starts_at < p_ends_at and s.ends_at > p_starts_at) then
    raise exception 'Det finnes allerede en markedsplassbestilling i dette tidsrommet.';
  end if;
  if exists (select 1 from public.external_appointments a where a.trainer_id=v_trainer_id and a.starts_at < p_ends_at and a.ends_at > p_starts_at) then
    raise exception 'Det finnes allerede en ekstern avtale i dette tidsrommet.';
  end if;
  if exists (
    select 1 from public.group_sessions gs join public.group_offerings go on go.id=gs.offering_id
    where go.trainer_id=v_trainer_id and go.completed_at is null and gs.starts_at < p_ends_at and gs.ends_at > p_starts_at
  ) then raise exception 'Det finnes allerede et kurs eller arrangement i dette tidsrommet.'; end if;
  if exists (select 1 from public.availability_exceptions e where e.trainer_id=v_trainer_id and e.kind='blocked' and e.starts_at < p_ends_at and e.ends_at > p_starts_at) then
    raise exception 'Tidsrommet er allerede blokkert.';
  end if;
  insert into public.external_appointments(trainer_id,client_id,dog_id,service_id,title,starts_at,ends_at,source,payment_status,price_nok,notes,sync_to_calendar)
  values(v_trainer_id,p_client_id,p_dog_id,p_service_id,coalesce(nullif(trim(p_title),''),'Ekstern avtale'),p_starts_at,p_ends_at,p_source,p_payment_status,coalesce(p_price_nok,0),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_sync_to_calendar,true))
  returning id into v_id;

  delete from public.availability_slots s
  where s.trainer_id=v_trainer_id and s.status='open' and s.starts_at < p_ends_at and s.ends_at > p_starts_at;

  return v_id;
end;
$$;
revoke execute on function public.create_external_appointment(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,boolean) from public, anon;
grant execute on function public.create_external_appointment(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,boolean) to authenticated;

create or replace function public.update_external_appointment(
  p_id uuid,
  p_client_id uuid,
  p_dog_id uuid,
  p_service_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_source text,
  p_payment_status text,
  p_price_nok integer,
  p_notes text,
  p_sync_to_calendar boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid := auth.uid();
begin
  if not exists(select 1 from public.external_appointments a where a.id=p_id and a.trainer_id=v_trainer_id) then raise exception 'Avtalen finnes ikke.'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Sluttiden må være etter starttiden.'; end if;
  if p_source not in ('phone','facebook','email','direct','other') then raise exception 'Ugyldig bestillingskilde.'; end if;
  if p_payment_status not in ('unpaid','paid_external','free') then raise exception 'Ugyldig betalingsstatus.'; end if;
  if p_client_id is not null and not exists (select 1 from public.trainer_clients c where c.id=p_client_id and c.trainer_id=v_trainer_id) then raise exception 'Kunden finnes ikke.'; end if;
  if p_dog_id is not null and not exists (select 1 from public.trainer_client_dogs d where d.id=p_dog_id and d.trainer_id=v_trainer_id and (p_client_id is null or d.client_id=p_client_id)) then raise exception 'Hunden finnes ikke.'; end if;
  if p_service_id is not null and not exists (select 1 from public.services s where s.id=p_service_id and s.trainer_id=v_trainer_id) then raise exception 'Tjenesten finnes ikke.'; end if;

  if exists (select 1 from public.availability_slots s where s.trainer_id=v_trainer_id and s.status in ('held','booked') and s.starts_at < p_ends_at and s.ends_at > p_starts_at) then raise exception 'Det finnes allerede en markedsplassbestilling i dette tidsrommet.'; end if;
  if exists (select 1 from public.external_appointments a where a.trainer_id=v_trainer_id and a.id<>p_id and a.starts_at < p_ends_at and a.ends_at > p_starts_at) then raise exception 'Det finnes allerede en ekstern avtale i dette tidsrommet.'; end if;
  if exists (select 1 from public.group_sessions gs join public.group_offerings go on go.id=gs.offering_id where go.trainer_id=v_trainer_id and go.completed_at is null and gs.starts_at < p_ends_at and gs.ends_at > p_starts_at) then raise exception 'Det finnes allerede et kurs eller arrangement i dette tidsrommet.'; end if;
  if exists (select 1 from public.availability_exceptions e where e.trainer_id=v_trainer_id and e.kind='blocked' and e.starts_at < p_ends_at and e.ends_at > p_starts_at) then raise exception 'Tidsrommet er blokkert.'; end if;
  update public.external_appointments set client_id=p_client_id,dog_id=p_dog_id,service_id=p_service_id,title=coalesce(nullif(trim(p_title),''),'Ekstern avtale'),starts_at=p_starts_at,ends_at=p_ends_at,source=p_source,payment_status=p_payment_status,price_nok=coalesce(p_price_nok,0),notes=nullif(trim(coalesce(p_notes,'')),''),sync_to_calendar=coalesce(p_sync_to_calendar,true),updated_at=now()
  where id=p_id and trainer_id=v_trainer_id;
end;
$$;
revoke execute on function public.update_external_appointment(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,boolean) from public, anon;
grant execute on function public.update_external_appointment(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,integer,text,boolean) to authenticated;

create or replace function public.delete_external_appointment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.external_appointments a where a.id=p_id and a.trainer_id=auth.uid()) then raise exception 'Avtalen finnes ikke.'; end if;
  delete from public.external_appointments where id=p_id and trainer_id=auth.uid();
end;
$$;
revoke execute on function public.delete_external_appointment(uuid) from public,anon;
grant execute on function public.delete_external_appointment(uuid) to authenticated;

-- Availability generation now treats manual appointments and group sessions as busy.
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
  where s.id = p_service_id and s.trainer_id = (select auth.uid()) and s.active = true;
  if v_trainer_id is null then raise exception 'Tjenesten finnes ikke, er inaktiv eller tilhører ikke brukeren.'; end if;
  p_days := greatest(1, least(coalesce(p_days, 60), 120));

  delete from public.availability_slots sl
  where sl.trainer_id=v_trainer_id and sl.service_id=p_service_id and sl.status='open' and sl.starts_at>=now();

  with local_days as (
    select gs::date as local_day from generate_series((now() at time zone 'Europe/Oslo')::date,(now() at time zone 'Europe/Oslo')::date+p_days,interval '1 day') gs
  ), recurring_candidates as (
    select wa.trainer_id,wa.service_id,candidate_start as starts_at,candidate_start+make_interval(mins=>v_duration) as ends_at
    from public.weekly_availability wa join local_days d on extract(dow from d.local_day)::smallint=wa.weekday
    cross join lateral generate_series(((d.local_day+wa.start_time) at time zone wa.timezone),((d.local_day+wa.end_time) at time zone wa.timezone)-make_interval(mins=>v_duration),make_interval(mins=>v_interval)) candidate_start
    where wa.trainer_id=v_trainer_id and wa.service_id=p_service_id and wa.active=true
  ), filtered as (
    select c.* from recurring_candidates c
    where c.starts_at>now()
      and not exists(select 1 from public.availability_exceptions e where e.trainer_id=v_trainer_id and (e.service_id is null or e.service_id=p_service_id) and e.kind='blocked' and c.starts_at<e.ends_at and c.ends_at>e.starts_at)
      and not exists(select 1 from public.calendar_busy_blocks cb where cb.trainer_id=v_trainer_id and c.starts_at<cb.ends_at and c.ends_at>cb.starts_at)
      and not exists(select 1 from public.external_appointments ea where ea.trainer_id=v_trainer_id and c.starts_at<ea.ends_at and c.ends_at>ea.starts_at)
      and not exists(select 1 from public.group_sessions gs join public.group_offerings go on go.id=gs.offering_id where go.trainer_id=v_trainer_id and go.completed_at is null and c.starts_at<gs.ends_at and c.ends_at>gs.starts_at)
      and not exists(select 1 from public.availability_slots existing where existing.trainer_id=v_trainer_id and existing.status in ('held','booked','blocked') and c.starts_at<existing.ends_at and c.ends_at>existing.starts_at)
  )
  insert into public.availability_slots(trainer_id,service_id,starts_at,ends_at,status)
  select trainer_id,service_id,starts_at,ends_at,'open' from filtered on conflict(service_id,starts_at) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Manually fill a class/event seat with an outside customer. This does not create
-- marketplace revenue or a trainer-ledger earning because payment happened outside.
create or replace function public.add_manual_group_participant(
  p_offering_id uuid,
  p_client_id uuid,
  p_dog_id uuid,
  p_customer_name text,
  p_dog_name text,
  p_source text default 'other',
  p_payment_status text default 'unpaid',
  p_price_nok integer default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid:=auth.uid();
  v_offering public.group_offerings%rowtype;
  v_id uuid;
  v_client_name text;
  v_dog_name text;
begin
  select * into v_offering from public.group_offerings where id=p_offering_id for update;
  if not found or v_offering.trainer_id<>v_trainer_id then raise exception 'Aktiviteten finnes ikke.'; end if;
  if v_offering.completed_at is not null then raise exception 'Aktiviteten er allerede fullført.'; end if;
  if public.group_available_places(p_offering_id) <= 0 then raise exception 'Aktiviteten er fullbooket eller en ledig plass er allerede reservert til ventelisten.'; end if;
  if p_source not in ('phone','facebook','email','direct','other') then raise exception 'Ugyldig bestillingskilde.'; end if;
  if p_payment_status not in ('unpaid','paid_external','free') then raise exception 'Ugyldig betalingsstatus.'; end if;

  if p_client_id is not null then select name into v_client_name from public.trainer_clients where id=p_client_id and trainer_id=v_trainer_id; end if;
  if p_dog_id is not null then select name into v_dog_name from public.trainer_client_dogs where id=p_dog_id and trainer_id=v_trainer_id and (p_client_id is null or client_id=p_client_id); end if;
  v_client_name:=coalesce(v_client_name,nullif(trim(p_customer_name),''));
  v_dog_name:=coalesce(v_dog_name,nullif(trim(p_dog_name),''));
  if v_client_name is null or v_dog_name is null then raise exception 'Skriv inn kunde og hund.'; end if;

  insert into public.group_manual_participants(offering_id,trainer_id,client_id,dog_id,customer_name,dog_name,source,payment_status,price_nok,notes)
  values(p_offering_id,v_trainer_id,p_client_id,p_dog_id,v_client_name,v_dog_name,p_source,p_payment_status,coalesce(p_price_nok,0),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  update public.group_offerings set confirmed_count=confirmed_count+1,updated_at=now() where id=p_offering_id;
  return v_id;
end;
$$;
revoke execute on function public.add_manual_group_participant(uuid,uuid,uuid,text,text,text,text,integer,text) from public,anon;
grant execute on function public.add_manual_group_participant(uuid,uuid,uuid,text,text,text,text,integer,text) to authenticated;

create or replace function public.remove_manual_group_participant(p_participant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid:=auth.uid();
  v_offering_id uuid;
begin
  select offering_id into v_offering_id from public.group_manual_participants where id=p_participant_id and trainer_id=v_trainer_id and status='active' for update;
  if v_offering_id is null then raise exception 'Deltakeren finnes ikke.'; end if;
  update public.group_manual_participants set status='cancelled',updated_at=now() where id=p_participant_id;
  update public.group_offerings set confirmed_count=greatest(0,confirmed_count-1),updated_at=now() where id=v_offering_id;
  return v_offering_id;
end;
$$;
revoke execute on function public.remove_manual_group_participant(uuid) from public,anon;
grant execute on function public.remove_manual_group_participant(uuid) to authenticated;

-- Capacity calculations now include manual outside participants through confirmed_count.
create or replace function public.group_available_places(p_offering_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, o.capacity
    - o.confirmed_count
    - (select count(*)::integer from public.group_enrollments e where e.offering_id=o.id and e.status='checkout_pending' and (e.checkout_expires_at is null or e.checkout_expires_at>now()))
    - (select count(*)::integer from public.group_waitlist w where w.offering_id=o.id and w.status='offered' and w.offer_expires_at>now())
  )
  from public.group_offerings o where o.id=p_offering_id and public.can_read_group_offering(o.id);
$$;
grant execute on function public.group_available_places(uuid) to public;

create or replace function public.system_promote_group_waitlist(p_offering_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offering public.group_offerings%rowtype;
  v_first_start timestamptz;
  v_checkout integer;
  v_offered integer;
  v_available integer;
  v_wait public.group_waitlist%rowtype;
  v_promoted integer:=0;
  v_expiry timestamptz;
begin
  select * into v_offering from public.group_offerings where id=p_offering_id for update;
  if not found or not v_offering.active or v_offering.completed_at is not null then return 0; end if;
  if not public.is_trainer_verified(v_offering.trainer_id) then return 0; end if;
  select min(starts_at) into v_first_start from public.group_sessions where offering_id=p_offering_id;
  if v_first_start is null or v_first_start<=now() then return 0; end if;

  update public.group_waitlist set status='expired',updated_at=now() where offering_id=p_offering_id and status='offered' and offer_expires_at is not null and offer_expires_at<=now();
  update public.group_waitlist w set status=case when w.offer_expires_at>now() then 'offered' else 'expired' end,converted_enrollment_id=null,updated_at=now()
  from public.group_enrollments e where w.converted_enrollment_id=e.id and w.status='checkout' and e.offering_id=p_offering_id and e.status='checkout_pending' and e.checkout_expires_at is not null and e.checkout_expires_at<=now();
  update public.group_enrollments set status='cancelled',payment_status='cancelled',cancelled_at=coalesce(cancelled_at,now()) where offering_id=p_offering_id and status='checkout_pending' and checkout_expires_at is not null and checkout_expires_at<=now();

  select count(*)::integer into v_checkout from public.group_enrollments where offering_id=p_offering_id and status='checkout_pending' and (checkout_expires_at is null or checkout_expires_at>now());
  select count(*)::integer into v_offered from public.group_waitlist where offering_id=p_offering_id and status='offered' and offer_expires_at>now();
  v_available:=greatest(0,v_offering.capacity-v_offering.confirmed_count-v_checkout-v_offered);
  while v_available>0 loop
    select * into v_wait from public.group_waitlist where offering_id=p_offering_id and status='waiting' order by joined_at,id for update skip locked limit 1;
    exit when not found;
    v_expiry:=least(now()+interval '24 hours',v_first_start);
    if v_expiry<=now() then exit; end if;
    update public.group_waitlist set status='offered',offered_at=now(),offer_expires_at=v_expiry,offer_notified_at=null,updated_at=now() where id=v_wait.id;
    v_available:=v_available-1; v_promoted:=v_promoted+1;
  end loop;
  return v_promoted;
end;
$$;
revoke execute on function public.system_promote_group_waitlist(uuid) from public,anon,authenticated;
grant execute on function public.system_promote_group_waitlist(uuid) to service_role;

-- Replace group checkout capacity check so confirmed_count includes manual seats.
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
  v_user_id uuid:=auth.uid();
  v_offering public.group_offerings%rowtype;
  v_dog public.dogs%rowtype;
  v_checkout integer;
  v_offered integer;
  v_enrollment_id uuid;
  v_platform_fee integer;
  v_first_start timestamptz;
  v_wait public.group_waitlist%rowtype;
begin
  if v_user_id is null then raise exception 'Du må være logget inn.'; end if;
  select * into v_offering from public.group_offerings where id=p_offering_id for update;
  if not found or not v_offering.active or v_offering.completed_at is not null or not public.is_trainer_verified(v_offering.trainer_id) then raise exception 'Kurset eller arrangementet er ikke tilgjengelig.'; end if;
  if v_offering.trainer_id=v_user_id then raise exception 'Du kan ikke bestille ditt eget arrangement.'; end if;
  select * into v_dog from public.dogs where id=p_dog_id and owner_id=v_user_id;
  if not found then raise exception 'Velg en av hundene dine.'; end if;
  select min(starts_at) into v_first_start from public.group_sessions where offering_id=p_offering_id;
  if v_first_start is null then raise exception 'Ingen datoer er publisert ennå.'; end if;
  if v_first_start<=now() then raise exception 'Påmeldingen er stengt fordi kurset eller arrangementet har startet.'; end if;

  update public.group_enrollments set status='cancelled',payment_status='cancelled',cancelled_at=coalesce(cancelled_at,now()) where offering_id=p_offering_id and status='checkout_pending' and checkout_expires_at is not null and checkout_expires_at<=now();
  perform public.system_promote_group_waitlist(p_offering_id);
  if exists(select 1 from public.group_enrollments where offering_id=p_offering_id and dog_id=p_dog_id and status in ('checkout_pending','confirmed')) then raise exception 'Denne hunden er allerede påmeldt.'; end if;
  select * into v_wait from public.group_waitlist where offering_id=p_offering_id and customer_id=v_user_id and dog_id=p_dog_id and status='offered' and offer_expires_at>now() order by offered_at desc limit 1 for update;
  select count(*)::integer into v_checkout from public.group_enrollments where offering_id=p_offering_id and status='checkout_pending' and (checkout_expires_at is null or checkout_expires_at>now());
  select count(*)::integer into v_offered from public.group_waitlist where offering_id=p_offering_id and status='offered' and offer_expires_at>now();
  if v_wait.id is null and v_offering.confirmed_count+v_checkout+v_offered>=v_offering.capacity then raise exception 'Det er fullt. Bli med på ventelisten for å få neste ledige plass.'; end if;
  v_platform_fee:=ceil(v_offering.price_nok*0.075)::integer;
  insert into public.group_enrollments(offering_id,customer_id,dog_id,dog_name,customer_note,subtotal_nok,service_fee_nok,platform_fee_nok,checkout_expires_at)
  values(p_offering_id,v_user_id,v_dog.id,v_dog.name,nullif(trim(coalesce(p_customer_note,'')),''),v_offering.price_nok,29,v_platform_fee,now()+interval '35 minutes') returning id into v_enrollment_id;
  if v_wait.id is not null then update public.group_waitlist set status='checkout',converted_enrollment_id=v_enrollment_id,updated_at=now() where id=v_wait.id; end if;
  return v_enrollment_id;
end;
$$;
revoke execute on function public.create_group_checkout_enrollment(uuid,uuid,text) from public,anon;
grant execute on function public.create_group_checkout_enrollment(uuid,uuid,text) to authenticated;
