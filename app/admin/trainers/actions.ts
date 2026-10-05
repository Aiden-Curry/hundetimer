'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyTrainerVerificationDecision } from '@/lib/email/verification-notifications';
import { sendTransactionalEmail } from '@/lib/email/server';
import { bestEffortNotification } from '@/lib/notifications/server';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Noe gikk galt.';
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/trainers');
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/');
  return { user, profile, admin: createAdminClient() };
}

export async function sendTrainerAgreementAction(formData: FormData) {
  const submissionId = String(formData.get('submissionId') || '');
  try {
    const { user, admin } = await ensureAdmin();
    const { data: submission, error } = await admin.from('trainer_verification_submissions').select('id,trainer_id,status,agreement_sent_at').eq('id', submissionId).maybeSingle();
    if (error || !submission) throw error || new Error('Fant ikke søknaden.');
    if (submission.status !== 'pending') throw new Error('Søknaden er allerede behandlet.');

    const { data: version } = await admin.from('trainer_agreement_versions').select('version').eq('is_current', true).maybeSingle();
    if (!version) throw new Error('Ingen aktiv treneravtale er konfigurert.');

    const now = submission.agreement_sent_at || new Date().toISOString();
    if (!submission.agreement_sent_at) {
      const { error: updateError } = await admin.from('trainer_verification_submissions').update({ agreement_sent_at: now, agreement_sent_by: user.id }).eq('id', submission.id);
      if (updateError) throw updateError;
    }

    await bestEffortNotification({
      userId: submission.trainer_id,
      type: 'verification',
      title: 'Treneravtalen er klar for signering',
      body: 'Hundetimer har sendt treneravtalen til deg. Les hele avtalen og signer den elektronisk fra kontoen din.',
      href: '/vilkar/treneravtale',
      eventKey: `trainer-agreement-sent/${submission.id}/${version.version}`,
    });

    try {
      const { data: authUser } = await admin.auth.admin.getUserById(submission.trainer_id);
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
      const agreementUrl = `${siteUrl}/vilkar/treneravtale`;
      await sendTransactionalEmail({
        to: authUser.user?.email,
        subject: 'Treneravtalen din på Hundetimer er klar',
        html: `<!doctype html><html lang="nb"><body style="margin:0;background:#f7f3eb;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fffdfc;border-radius:22px;padding:34px"><p style="margin:0 0 12px;color:#8fa892;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Hundetimer</p><h1 style="font-size:28px;margin:0 0 16px">Treneravtalen er klar</h1><p style="line-height:1.6">Vi har gått videre med trenersøknaden din. Les treneravtalen nøye og signer den elektronisk. Hundetimer signerer avtalen etter deg før søknaden kan godkjennes.</p><p style="margin:26px 0"><a href="${esc(agreementUrl)}" style="display:inline-block;background:#234033;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">Les og signer treneravtalen</a></p></div></div></body></html>`,
        text: `Treneravtalen din er klar. Les og signer den her: ${agreementUrl}`,
        idempotencyKey: `trainer-agreement-sent-${submission.id}-${version.version}`,
      });
    } catch (emailError) {
      console.error('Trainer agreement email failed', emailError);
    }
  } catch (error) {
    redirect(`/admin/trainers?error=${encodeURIComponent(messageOf(error))}`);
  }

  revalidatePath('/admin/trainers');
  revalidatePath('/bli-trener');
  revalidatePath('/trainer-dashboard/verification');
  redirect('/admin/trainers?message=Treneravtalen+er+sendt+til+søkeren');
}

export async function countersignTrainerAgreementAction(formData: FormData) {
  const submissionId = String(formData.get('submissionId') || '');
  const signatureNameInput = String(formData.get('signatureName') || '').trim();
  try {
    const { user, profile, admin } = await ensureAdmin();
    const signatureName = signatureNameInput || profile?.display_name?.trim() || 'Hundetimer';
    const { data: submission, error } = await admin.from('trainer_verification_submissions').select('id,trainer_id,status,agreement_acceptance_id').eq('id', submissionId).maybeSingle();
    if (error || !submission) throw error || new Error('Fant ikke søknaden.');
    if (submission.status !== 'pending') throw new Error('Søknaden er allerede behandlet.');

    const { data: currentAgreementVersion } = await admin.from('trainer_agreement_versions').select('version').eq('is_current', true).maybeSingle();
    if (!currentAgreementVersion) throw new Error('Ingen aktiv treneravtale er konfigurert.');
    const { data: acceptance } = await admin.from('trainer_agreement_acceptances').select('id,trainer_signed_at,admin_signed_at').eq('trainer_id', submission.trainer_id).eq('agreement_version', currentAgreementVersion.version).maybeSingle();
    if (!acceptance?.trainer_signed_at) throw new Error('Treneren må signere avtalen før Hundetimer kan signere.');
    if (acceptance.admin_signed_at) throw new Error('Hundetimer har allerede signert denne avtalen.');

    const now = new Date().toISOString();
    const { error: signError } = await admin.from('trainer_agreement_acceptances').update({
      admin_signature_name: signatureName,
      admin_signed_at: now,
      admin_signed_by: user.id,
    }).eq('id', acceptance.id);
    if (signError) throw signError;

    if (submission.agreement_acceptance_id !== acceptance.id) {
      await admin.from('trainer_verification_submissions').update({ agreement_acceptance_id: acceptance.id }).eq('id', submission.id);
    }

    await bestEffortNotification({
      userId: submission.trainer_id,
      type: 'verification',
      title: 'Hundetimer har signert treneravtalen',
      body: 'Treneravtalen er nå signert av begge parter. Søknaden din venter på endelig godkjenning.',
      href: '/trainer-dashboard/verification',
      eventKey: `trainer-agreement-countersigned/${acceptance.id}`,
    });
  } catch (error) {
    redirect(`/admin/trainers?error=${encodeURIComponent(messageOf(error))}`);
  }

  revalidatePath('/admin/trainers');
  revalidatePath('/bli-trener');
  revalidatePath('/trainer-dashboard/verification');
  redirect('/admin/trainers?message=Hundetimer+har+signert+treneravtalen');
}

export async function approveTrainerVerificationAction(formData: FormData) {
  const submissionId = String(formData.get('submissionId') || '');
  const note = String(formData.get('note') || '').trim();
  try {
    const { user, admin } = await ensureAdmin();
    const { data: submission, error } = await admin.from('trainer_verification_submissions').select('id,trainer_id,status,agreement_acceptance_id').eq('id', submissionId).maybeSingle();
    if (error || !submission) throw error || new Error('Fant ikke søknaden.');
    if (submission.status !== 'pending') throw new Error('Søknaden er allerede behandlet.');
    const { data: currentAgreementVersion } = await admin.from('trainer_agreement_versions').select('version').eq('is_current', true).maybeSingle();
    const { data: agreementAcceptance } = currentAgreementVersion ? await admin.from('trainer_agreement_acceptances').select('id,trainer_signed_at,admin_signed_at').eq('trainer_id', submission.trainer_id).eq('agreement_version', currentAgreementVersion.version).order('accepted_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
    if (!agreementAcceptance?.trainer_signed_at) throw new Error('Treneren har ikke signert gjeldende treneravtale ennå.');
    if (!agreementAcceptance.admin_signed_at) throw new Error('Hundetimer må signere treneravtalen før treneren kan godkjennes.');
    if (submission.agreement_acceptance_id !== agreementAcceptance.id) await admin.from('trainer_verification_submissions').update({ agreement_acceptance_id: agreementAcceptance.id }).eq('id', submission.id);
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
    const { data: submission, error } = await admin.from('trainer_verification_submissions').select('id,trainer_id,status').eq('id', submissionId).maybeSingle();
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
  revalidatePath('/trainer-dashboard/verification');
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
