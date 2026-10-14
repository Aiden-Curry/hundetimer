-- Apply after the existing Stripe, group-course and online-course upgrades.
-- Additive guards: existing ownership/RLS/approval policies remain in place.
begin;

create or replace function public.trainer_can_receive_payments(p_trainer_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trainer_profiles t
    join public.trainer_payment_accounts a on a.trainer_id = t.id
    where t.id = p_trainer_id and t.verification_status = 'approved'
      and a.stripe_account_id is not null and a.stripe_account_id <> ''
      and a.details_submitted and a.payouts_enabled and a.transfers_active
  );
$$;
revoke all on function public.trainer_can_receive_payments(uuid) from public, anon, authenticated;

create or replace function public.guard_paid_publication()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_live boolean;
begin
  if tg_table_name = 'online_courses' then v_live := new.published;
  else v_live := new.active;
  end if;
  if v_live and not public.trainer_can_receive_payments(new.trainer_id) then
    raise exception 'Koble til Stripe før du publiserer betalte tilbud.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_paid_publication() from public, anon, authenticated;

drop trigger if exists guard_paid_publication on public.services;
create trigger guard_paid_publication before insert or update of active, price_nok, trainer_id
on public.services for each row execute function public.guard_paid_publication();
drop trigger if exists guard_paid_publication on public.group_offerings;
create trigger guard_paid_publication before insert or update of active, price_nok, trainer_id
on public.group_offerings for each row execute function public.guard_paid_publication();
drop trigger if exists guard_paid_publication on public.online_courses;
create trigger guard_paid_publication before insert or update of published, price_nok, trainer_id
on public.online_courses for each row execute function public.guard_paid_publication();

-- Existing listings may predate this upgrade or lose payout readiness later.
-- Check purchase creation too, including direct RPC requests. Cancellation,
-- refunds and historical payment reconciliation are deliberately unaffected.
create or replace function public.guard_paid_purchase()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_trainer_id uuid;
begin
  if tg_table_name = 'bookings' then v_trainer_id := new.trainer_id;
  elsif tg_table_name = 'group_enrollments' then
    select trainer_id into v_trainer_id from public.group_offerings where id = new.offering_id;
  else
    select trainer_id into v_trainer_id from public.online_courses where id = new.course_id;
  end if;
  if new.subtotal_nok + new.service_fee_nok > 0
    and not public.trainer_can_receive_payments(v_trainer_id) then
    raise exception 'Treneren kan ikke motta betalinger ennå. Prøv igjen senere.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_paid_purchase() from public, anon, authenticated;
drop trigger if exists guard_paid_purchase on public.bookings;
create trigger guard_paid_purchase before insert on public.bookings
for each row execute function public.guard_paid_purchase();
drop trigger if exists guard_paid_booking_confirmation on public.bookings;
create trigger guard_paid_booking_confirmation before update of status on public.bookings
for each row when (new.status = 'confirmed' and old.status is distinct from new.status)
execute function public.guard_paid_purchase();
drop trigger if exists guard_paid_purchase on public.group_enrollments;
create trigger guard_paid_purchase before insert on public.group_enrollments
for each row execute function public.guard_paid_purchase();
drop trigger if exists guard_paid_purchase on public.online_course_purchases;
create trigger guard_paid_purchase before insert on public.online_course_purchases
for each row execute function public.guard_paid_purchase();

commit;
