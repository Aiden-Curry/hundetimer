-- Hundetimer v29.8: private trainer agreement signing flow
-- Run after trainer-agreement-upgrade.sql and single-login-trainer-access-upgrade.sql.

alter table public.trainer_verification_submissions
  add column if not exists agreement_sent_at timestamptz,
  add column if not exists agreement_sent_by uuid references public.profiles(id);

alter table public.trainer_agreement_acceptances
  add column if not exists trainer_signature_name text,
  add column if not exists trainer_signed_at timestamptz,
  add column if not exists admin_signature_name text,
  add column if not exists admin_signed_at timestamptz,
  add column if not exists admin_signed_by uuid references public.profiles(id);

-- The application is now submitted before the agreement is sent.
drop trigger if exists require_current_trainer_agreement_trigger on public.trainer_verification_submissions;

-- Existing approved trainers keep their historical agreement record. Their old
-- approval is treated as Hundetimer's countersignature so they are not blocked
-- by the new flow.
update public.trainer_agreement_acceptances a
set trainer_signed_at = coalesce(a.trainer_signed_at, a.accepted_at),
    trainer_signature_name = coalesce(a.trainer_signature_name, t.business_name),
    admin_signed_at = coalesce(a.admin_signed_at, t.verification_reviewed_at, a.accepted_at),
    admin_signature_name = coalesce(a.admin_signature_name, 'Hundetimer')
from public.trainer_profiles t
where t.id = a.trainer_id
  and t.verification_status in ('approved', 'suspended');

-- Pending and rejected applications created by the previous clickwrap flow
-- should go through the new send, trainer-sign, Hundetimer-sign sequence.
update public.trainer_verification_submissions s
set agreement_acceptance_id = null,
    agreement_sent_at = null,
    agreement_sent_by = null
from public.trainer_profiles t
where t.id = s.trainer_id
  and t.verification_status in ('pending', 'rejected');

delete from public.trainer_agreement_acceptances a
using public.trainer_profiles t
where t.id = a.trainer_id
  and t.verification_status in ('pending', 'rejected');

-- Agreement versions are no longer public content. They are readable only by
-- signed-in applicants/trainers and admins.
drop policy if exists "trainer_agreement_versions_public_read" on public.trainer_agreement_versions;
drop policy if exists "trainer_agreement_versions_private_read" on public.trainer_agreement_versions;
create policy "trainer_agreement_versions_private_read" on public.trainer_agreement_versions
  for select to authenticated using (
    public.is_current_user_admin()
    or exists (select 1 from public.trainer_profiles t where t.id = auth.uid())
  );

-- Keep acceptance copies private to the trainer and admins.
drop policy if exists "trainer_agreement_acceptances_own_read" on public.trainer_agreement_acceptances;
create policy "trainer_agreement_acceptances_own_read" on public.trainer_agreement_acceptances
  for select to authenticated using (trainer_id = auth.uid() or public.is_current_user_admin());
