-- Apply after online-courses-upgrade.sql and course-progress-integrity-upgrade.sql.
BEGIN;

drop policy if exists online_course_progress_trainer_read on public.online_course_progress;

create policy online_course_progress_trainer_read
on public.online_course_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.online_course_purchases p
    join public.online_courses c on c.id = p.course_id
    where p.id = online_course_progress.purchase_id
      and c.trainer_id = auth.uid()
      and p.status = 'active'
      and p.payment_status = 'captured'
  )
);

-- Profiles also contain private moderation fields. Return only display names
-- rather than granting trainers SELECT on entire customer profile rows.
-- Existing self/private-booking profile policies remain untouched.
create or replace function public.trainer_online_course_customer_names(p_course_id uuid)
returns table (customer_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select distinct p.customer_id, profile.display_name
  from public.online_course_purchases p
  join public.online_courses c on c.id = p.course_id
  join public.profiles profile on profile.id = p.customer_id
  where c.id = p_course_id
    and c.trainer_id = auth.uid()
    and p.status = 'active'
    and p.payment_status = 'captured';
$$;
revoke all on function public.trainer_online_course_customer_names(uuid) from public, anon;
grant execute on function public.trainer_online_course_customer_names(uuid) to authenticated;

-- No progress write grants or customer/admin policy changes.
COMMIT;
