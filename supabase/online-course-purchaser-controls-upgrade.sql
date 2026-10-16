-- Apply after trainer-online-course-progress-upgrade.sql and course-progress-integrity-upgrade.sql.
BEGIN;

alter table public.online_course_purchases
  add column if not exists access_revoked_at timestamptz,
  add column if not exists access_revoked_by uuid references public.profiles(id) on delete set null,
  add column if not exists access_revoked_reason text,
  add column if not exists access_version integer not null default 0,
  add column if not exists stripe_refund_id text,
  add column if not exists refund_status text,
  add column if not exists refund_locked_until timestamptz;

create unique index if not exists online_course_purchase_refund_uidx
  on public.online_course_purchases(stripe_refund_id) where stripe_refund_id is not null;
create unique index if not exists trainer_ledger_course_refund_adjustment_uidx
  on public.trainer_ledger(online_course_purchase_id)
  where entry_type = 'adjustment' and description = 'Refusjon av nettkurs';

create table if not exists public.online_course_purchase_events (
  event_key text primary key,
  purchase_id uuid not null references public.online_course_purchases(id),
  kind text not null check(kind in ('refunded','revoked','restored')),
  reason text,
  created_at timestamptz not null default now(),
  email_sent_at timestamptz,
  email_locked_until timestamptz
);
alter table public.online_course_purchase_events enable row level security;
revoke all on public.online_course_purchase_events from anon, authenticated;
grant all on public.online_course_purchase_events to service_role;

create or replace function public.system_claim_course_event_email(p_event_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.online_course_purchase_events set email_locked_until = now() + interval '5 minutes'
  where event_key = p_event_key and email_sent_at is null
    and (email_locked_until is null or email_locked_until < now());
  return found;
end;
$$;
revoke all on function public.system_claim_course_event_email(text) from public, anon, authenticated;
grant execute on function public.system_claim_course_event_email(text) to service_role;

create or replace function public.set_online_course_purchase_access(p_purchase_id uuid, p_revoke boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_purchase public.online_course_purchases%rowtype; v_key text;
begin
  select p.* into v_purchase from public.online_course_purchases p
  join public.online_courses c on c.id = p.course_id
  where p.id = p_purchase_id and c.trainer_id = auth.uid() for update of p;
  if not found then raise exception 'Fant ikke kjøpet.'; end if;
  if v_purchase.status <> 'active' or v_purchase.payment_status <> 'captured' then
    raise exception 'Bare betalte kjøp uten refusjon kan endre tilgang.';
  end if;
  if p_revoke = (v_purchase.access_revoked_at is not null) then
    return jsonb_build_object('event_key', 'course-access-' || case when p_revoke then 'revoked/' else 'restored/' end || p_purchase_id || '/' || v_purchase.access_version);
  end if;
  update public.online_course_purchases set
    access_revoked_at = case when p_revoke then now() else null end,
    access_revoked_by = case when p_revoke then auth.uid() else null end,
    access_revoked_reason = case when p_revoke then nullif(left(trim(p_reason),500),'') else null end,
    access_version = access_version + 1
  where id = p_purchase_id returning * into v_purchase;
  v_key := 'course-access-' || case when p_revoke then 'revoked/' else 'restored/' end || p_purchase_id || '/' || v_purchase.access_version;
  insert into public.online_course_purchase_events(event_key,purchase_id,kind,reason)
    values(v_key,p_purchase_id,case when p_revoke then 'revoked' else 'restored' end,v_purchase.access_revoked_reason);
  return jsonb_build_object('event_key', v_key);
end;
$$;
revoke all on function public.set_online_course_purchase_access(uuid,boolean,text) from public, anon;
grant execute on function public.set_online_course_purchase_access(uuid,boolean,text) to authenticated;

create or replace function public.system_claim_online_course_refund(p_purchase_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.online_course_purchases set refund_locked_until = now() + interval '5 minutes'
  where id = p_purchase_id and status = 'active' and payment_status = 'captured'
    and (refund_locked_until is null or refund_locked_until < now());
  return found;
end;
$$;
revoke all on function public.system_claim_online_course_refund(uuid) from public, anon, authenticated;
grant execute on function public.system_claim_online_course_refund(uuid) to service_role;

-- Only called after retrieving the actual Stripe refund and validating its
-- PaymentIntent, currency and full amount on the server. Atomic with ledger changes.
create or replace function public.system_finalize_online_course_refund(p_purchase_id uuid, p_refund_id text, p_refund_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_purchase public.online_course_purchases%rowtype; v_earning public.trainer_ledger%rowtype;
begin
  select * into v_purchase from public.online_course_purchases where id = p_purchase_id for update;
  if not found then raise exception 'Fant ikke kjøpet.'; end if;
  if v_purchase.stripe_refund_id is not null
    and v_purchase.stripe_refund_id <> p_refund_id
    and v_purchase.refund_status is distinct from 'failed' then
    raise exception 'Refusjonen tilhører ikke kjøpet.';
  end if;
  if v_purchase.payment_status = 'refunded' then return; end if;
  if v_purchase.status <> 'active' or v_purchase.payment_status <> 'captured' then raise exception 'Kjøpet kan ikke refunderes.'; end if;
  update public.online_course_purchases set stripe_refund_id = p_refund_id, refund_status = p_refund_status,
    refund_locked_until = null where id = p_purchase_id;
  if p_refund_status <> 'succeeded' then return; end if;
  -- Serialize with payout item assignment before deciding whether the earning
  -- can be reversed or needs a compensating entry in a future payout.
  lock table public.payout_items in share row exclusive mode;
  select * into v_earning from public.trainer_ledger
    where online_course_purchase_id = p_purchase_id and entry_type = 'earning' for update;
  if found then
    if v_earning.status = 'eligible' and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = v_earning.id) then
      update public.trainer_ledger set status = 'reversed' where id = v_earning.id;
    elsif v_earning.status in ('eligible','batched','paid') then
      insert into public.trainer_ledger(trainer_id,online_course_purchase_id,entry_type,description,
        gross_service_nok,platform_fee_nok,amount_nok,status,completed_at,scheduled_payout_date)
      values(v_earning.trainer_id,p_purchase_id,'adjustment','Refusjon av nettkurs',
        -v_earning.gross_service_nok,-v_earning.platform_fee_nok,-v_earning.amount_nok,'eligible',now(),public.scheduled_trainer_payout_date(now()))
      on conflict do nothing;
    end if;
  end if;
  update public.online_course_purchases set status = 'refunded', payment_status = 'refunded',
    refunded_at = coalesce(refunded_at,now()) where id = p_purchase_id;
  insert into public.online_course_purchase_events(event_key,purchase_id,kind)
    values('course-refunded/' || p_purchase_id,p_purchase_id,'refunded') on conflict do nothing;
end;
$$;
revoke all on function public.system_finalize_online_course_refund(uuid,text,text) from public, anon, authenticated;
grant execute on function public.system_finalize_online_course_refund(uuid,text,text) to service_role;

-- Retain trainer visibility of refunded customers' names, without exposing profiles.
create or replace function public.trainer_online_course_customer_names(p_course_id uuid)
returns table(customer_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select distinct p.customer_id, profile.display_name from public.online_course_purchases p
  join public.online_courses c on c.id = p.course_id join public.profiles profile on profile.id = p.customer_id
  where c.id = p_course_id and c.trainer_id = auth.uid()
    and p.status in ('active','refunded') and p.payment_status in ('captured','refunded');
$$;
revoke all on function public.trainer_online_course_customer_names(uuid) from public, anon;
grant execute on function public.trainer_online_course_customer_names(uuid) to authenticated;

-- Refunded and revoked participants retain trainer-visible progress history.
drop policy if exists online_course_progress_trainer_read on public.online_course_progress;
create policy online_course_progress_trainer_read on public.online_course_progress
  for select to authenticated using (exists (
    select 1 from public.online_course_purchases p join public.online_courses c on c.id = p.course_id
    where p.id = online_course_progress.purchase_id and c.trainer_id = auth.uid()
      and p.status in ('active','refunded') and p.payment_status in ('captured','refunded')
  ));

-- Guard both the current completion RPC and the legacy RPC; progress/history is retained.
create or replace function public.guard_online_course_progress_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_purchase public.online_course_purchases%rowtype;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select * into v_purchase from public.online_course_purchases
    where id = case when tg_op = 'DELETE' then old.purchase_id else new.purchase_id end for update;
  if not found or v_purchase.customer_id is distinct from auth.uid()
    or v_purchase.status <> 'active' or v_purchase.payment_status <> 'captured' or v_purchase.access_revoked_at is not null then
    raise exception 'Du har ikke tilgang til dette kurset.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_online_course_progress_access() from public, anon, authenticated;
drop trigger if exists guard_online_course_progress_access on public.online_course_progress;
create trigger guard_online_course_progress_access before insert or update or delete on public.online_course_progress
  for each row execute function public.guard_online_course_progress_access();

create or replace function public.can_access_online_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.online_courses c
    where c.id = p_course_id
      and (
        c.trainer_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
        or exists (
          select 1 from public.online_course_purchases p
          where p.course_id = c.id and p.customer_id = auth.uid() and p.status = 'active' and p.payment_status = 'captured' and p.access_revoked_at is null
        )
      )
  );
$$;

create or replace function public.set_online_course_lesson_complete_v2(
  p_purchase_id uuid,
  p_lesson_id uuid,
  p_complete boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_course_id uuid;
  v_was_completed boolean := false;
  v_certificate_enabled boolean := false;
  v_total integer := 0;
  v_done integer := 0;
  v_certificate_id text;
  v_newly_completed boolean := false;
begin
  select p.course_id, (p.course_completed_at is not null)
    into v_course_id, v_was_completed
  from public.online_course_purchases p
  where p.id = p_purchase_id
    and p.customer_id = v_user_id
    and p.status = 'active'
    and p.payment_status = 'captured'
    and p.access_revoked_at is null
  for update;

  if not found then
    raise exception 'Du har ikke tilgang til dette kurset.';
  end if;

  if not exists (
    select 1 from public.online_course_lessons l
    where l.id = p_lesson_id and l.course_id = v_course_id
  ) then
    raise exception 'Leksjonen finnes ikke.';
  end if;

  if p_complete then
    insert into public.online_course_progress(purchase_id, lesson_id)
    values(p_purchase_id, p_lesson_id)
    on conflict (purchase_id, lesson_id)
    do update set completed_at = excluded.completed_at;
  else
    delete from public.online_course_progress
    where purchase_id = p_purchase_id and lesson_id = p_lesson_id;
  end if;

  select count(*) into v_total
  from public.online_course_lessons l
  where l.course_id = v_course_id;

  select count(*) into v_done
  from public.online_course_progress pr
  join public.online_course_lessons l on l.id = pr.lesson_id
  where pr.purchase_id = p_purchase_id
    and l.course_id = v_course_id;

  select c.certificate_enabled into v_certificate_enabled
  from public.online_courses c
  where c.id = v_course_id;

  if v_total > 0 and v_done >= v_total and not v_was_completed then
    v_newly_completed := true;
    if v_certificate_enabled then
      v_certificate_id := 'CERT-' || to_char(now() at time zone 'Europe/Oslo', 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    end if;

    update public.online_course_purchases
    set course_completed_at = now(),
        certificate_id = case when v_certificate_enabled then v_certificate_id else certificate_id end,
        certificate_issued_at = case when v_certificate_enabled then now() else certificate_issued_at end
    where id = p_purchase_id;
  else
    select p.certificate_id into v_certificate_id
    from public.online_course_purchases p where p.id = p_purchase_id;
  end if;

  return jsonb_build_object(
    'completed', v_was_completed or v_newly_completed,
    'newly_completed', v_newly_completed,
    'certificate_id', v_certificate_id,
    'completed_lessons', v_done,
    'total_lessons', v_total
  );
end;
$$;

create or replace function public.issue_existing_course_certificates_on_enable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.certificate_enabled = true and old.certificate_enabled = false then
    update public.online_course_purchases p
    set certificate_id = 'CERT-' || to_char(coalesce(p.course_completed_at, now()) at time zone 'Europe/Oslo', 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        certificate_issued_at = now()
    where p.course_id = new.id
      and p.status = 'active'
      and p.payment_status = 'captured'
      and p.access_revoked_at is null
      and p.course_completed_at is not null
      and p.certificate_id is null;
  end if;
  return new;
end;
$$;

COMMIT;
