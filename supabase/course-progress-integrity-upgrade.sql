-- Run after certificates-upgrade.sql.
-- Serialize progress changes per purchase so simultaneous final lessons issue one certificate.
-- All customer progress writes must use the completion-aware RPC.
drop policy if exists "online_course_progress_owner_insert" on public.online_course_progress;
drop policy if exists "online_course_progress_owner_delete" on public.online_course_progress;
revoke insert, update, delete on public.online_course_progress from anon, authenticated;

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

revoke execute on function public.set_online_course_lesson_complete_v2(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_online_course_lesson_complete_v2(uuid, uuid, boolean) to authenticated;


-- Enabling certificates later only issues them for active, paid purchases.
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
      and p.course_completed_at is not null
      and p.certificate_id is null;
  end if;
  return new;
end;
$$;

