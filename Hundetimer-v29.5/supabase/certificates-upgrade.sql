-- MVP v23: automatic completion certificates for online courses
-- Run once after v22.

alter table public.online_courses
  add column if not exists certificate_enabled boolean not null default true,
  add column if not exists certificate_subtitle text;

alter table public.online_course_purchases
  add column if not exists course_completed_at timestamptz,
  add column if not exists certificate_id text,
  add column if not exists certificate_issued_at timestamptz;

create unique index if not exists online_course_purchases_certificate_id_uidx
  on public.online_course_purchases(certificate_id)
  where certificate_id is not null;

-- New progress endpoint. Once every lesson has been completed at least once,
-- the purchase is permanently considered completed and the certificate is issued.
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
    and p.payment_status = 'captured';

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

revoke execute on function public.set_online_course_lesson_complete_v2(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_online_course_lesson_complete_v2(uuid, uuid, boolean) to authenticated;

-- Keep direct table writes locked down. Course owners can read their own completion data
-- through the existing purchase RLS policy.

-- Backfill certificates for customers who had already completed every lesson before v23.
with completed as (
  select p.id,
         max(pr.completed_at) as completed_at,
         c.certificate_enabled
  from public.online_course_purchases p
  join public.online_courses c on c.id = p.course_id
  join public.online_course_lessons l on l.course_id = p.course_id
  left join public.online_course_progress pr on pr.purchase_id = p.id and pr.lesson_id = l.id
  where p.status = 'active'
    and p.payment_status = 'captured'
    and p.course_completed_at is null
  group by p.id, c.certificate_enabled
  having count(l.id) > 0 and count(pr.lesson_id) = count(l.id)
)
update public.online_course_purchases p
set course_completed_at = completed.completed_at,
    certificate_id = case when completed.certificate_enabled then 'CERT-' || to_char(coalesce(completed.completed_at, now()) at time zone 'Europe/Oslo', 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) else null end,
    certificate_issued_at = case when completed.certificate_enabled then coalesce(completed.completed_at, now()) else null end
from completed
where p.id = completed.id;

-- If a trainer enables certificates later, issue them to customers who already
-- completed the course while certificates were disabled.
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
      and p.course_completed_at is not null
      and p.certificate_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists online_course_certificate_enable_trigger on public.online_courses;
create trigger online_course_certificate_enable_trigger
after update of certificate_enabled on public.online_courses
for each row execute function public.issue_existing_course_certificates_on_enable();

-- The v23 client uses the certificate-aware progress function exclusively.
revoke execute on function public.set_online_course_lesson_complete(uuid, uuid, boolean) from authenticated, public, anon;
