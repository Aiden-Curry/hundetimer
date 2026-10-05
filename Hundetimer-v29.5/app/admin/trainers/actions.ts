'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyTrainerVerificationDecision } from '@/lib/email/verification-notifications';
import { bestEffortNotification } from '@/lib/notifications/server';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Noe gikk galt.';
}

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/trainers');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/');
  return { user, admin: createAdminClient() };
}

export async function approveTrainerVerificationAction(formData: FormData) {
  const submissionId = String(formData.get('submissionId') || '');
  const note = String(formData.get('note') || '').trim();
  try {
    const { user, admin } = await ensureAdmin();
    const { data: submission, error } = await admin.from('trainer_verification_submissions').select('id, trainer_id, status, agreement_acceptance_id').eq('id', submissionId).maybeSingle();
    if (error || !submission) throw error || new Error('Fant ikke søknaden.');
    if (submission.status !== 'pending') throw new Error('Søknaden er allerede behandlet.');
    const { data: currentAgreementVersion } = await admin.from('trainer_agreement_versions').select('version').eq('is_current', true).maybeSingle();
    const { data: agreementAcceptance } = currentAgreementVersion ? await admin.from('trainer_agreement_acceptances').select('id').eq('trainer_id', submission.trainer_id).eq('agreement_version', currentAgreementVersion.version).order('accepted_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
    if (!agreementAcceptance) throw new Error('Treneren har ikke godtatt gjeldende treneravtale. Be treneren godta avtalen før søknaden godkjennes.');
    if (!submission.agreement_acceptance_id) await admin.from('trainer_verification_submissions').update({ agreement_acceptance_id: agreementAcceptance.id }).eq('id', submission.id);
    const now = new Date().toISOString();
    const { error: submissionError } = await admin.from('trainer_verification_submissions').update({ status: 'approved', reviewed_at: now, reviewed_by: user.id, admin_note: note || null }).eq('id', submission.id);
    if (submissionError) throw submissionError;
    const { error: trainerError } = await admin.from('trainer_profiles').update({ verified: true, verification_status: 'approved', verification_reviewed_at: now, verification_review_note: note || null, updated_at: now }).eq('id', submission.trainer_id);
    if (trainerError) throw trainerError;
    const { error: roleError } = await admin.from('profiles').update({ role: 'trainer', updated_at: now }).eq('id', submission.trainer_id).neq('role', 'admin');
    if (roleError) throw roleError;
    try { await notifyTrainerVerificationDecision(submission.trainer_id, submission.id, 'approved', note || null); } catch (emailError) { console.error('Verification approval email failed', emailError); }
  } catch (error) {
    redirect(`/admin/trainers?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/admin/trainers');
  revalidatePath('/discover');
  revalidatePath('/account');
  revalidatePath('/trainer-dashboard');
  redirect('/admin/trainers?message=Treneren+er+godkjent');
}

export async function rejectTrainerVerificationAction(formData: FormData) {
  const submissionId = String(formData.get('submissionId') || '');
  const note = String(formData.get('note') || '').trim();
  try {
    if (!note) throw new Error('Skriv en kort begrunnelse slik at treneren vet hva som må endres.');
    const { user, admin } = await ensureAdmin();
    const { data: submission, error } = await admin.from('trainer_verification_submissions').select('id, trainer_id, status').eq('id', submissionId).maybeSingle();
    if (error || !submission) throw error || new Error('Fant ikke søknaden.');
    if (submission.status !== 'pending') throw new Error('Søknaden er allerede behandlet.');
    const now = new Date().toISOString();
    const { error: submissionError } = await admin.from('trainer_verification_submissions').update({ status: 'rejected', reviewed_at: now, reviewed_by: user.id, admin_note: note }).eq('id', submission.id);
    if (submissionError) throw submissionError;
    const { error: trainerError } = await admin.from('trainer_profiles').update({ verified: false, verification_status: 'rejected', verification_reviewed_at: now, verification_review_note: note, updated_at: now }).eq('id', submission.trainer_id);
    if (trainerError) throw trainerError;
    const { error: roleError } = await admin.from('profiles').update({ role: 'owner', updated_at: now }).eq('id', submission.trainer_id).eq('role', 'trainer');
    if (roleError) throw roleError;
    try { await notifyTrainerVerificationDecision(submission.trainer_id, submission.id, 'rejected', note); } catch (emailError) { console.error('Verification rejection email failed', emailError); }
  } catch (error) {
    redirect(`/admin/trainers?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/admin/trainers');
  revalidatePath('/account');
  revalidatePath('/bli-trener');
  redirect('/admin/trainers?message=Søknaden+er+avvist+med+tilbakemelding');
}

export async function suspendTrainerAction(formData: FormData) {
  const trainerId = String(formData.get('trainerId') || '');
  const note = String(formData.get('note') || '').trim();
  try {
    const { admin } = await ensureAdmin();
    const now = new Date().toISOString();
    const { error } = await admin.from('trainer_profiles').update({ verified: false, verification_status: 'suspended', verification_reviewed_at: now, verification_review_note: note || 'Profilen er midlertidig skjult av administrator.', updated_at: now }).eq('id', trainerId);
    if (error) throw error;
    await bestEffortNotification({ userId: trainerId, type: 'verification', title: 'Trenerprofilen er midlertidig skjult', body: note || 'Profilen er skjult av administrator. Kontakt oss hvis du har spørsmål.', href: '/trainer-dashboard/verification', eventKey: `trainer-suspended/${trainerId}/${now}` });
  } catch (error) {
    redirect(`/admin/trainers?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/admin/trainers');
  revalidatePath('/discover');
  redirect('/admin/trainers?message=Trenerprofilen+er+skjult');
}
