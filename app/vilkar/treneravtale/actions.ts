'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRAINER_AGREEMENT_VERSION, trainerAgreementPlainText } from '@/lib/legal/trainer-agreement';
import { bestEffortNotification } from '@/lib/notifications/server';

function back(message: string, error = false): never {
  redirect(`/vilkar/treneravtale?${error ? 'error' : 'message'}=${encodeURIComponent(message)}`);
}

export async function signTrainerAgreementAction(formData: FormData) {
  const signatureName = String(formData.get('signatureName') || '').trim();
  if (signatureName.length < 2) back('Skriv inn fullt navn for å signere avtalen.', true);
  if (formData.get('confirmSignature') !== 'on') back('Du må bekrefte at den elektroniske signaturen er bindende.', true);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/vilkar/treneravtale');

  const admin = createAdminClient();
  const [{ data: profile }, { data: trainer }, { data: latest }, { data: currentVersion }, { data: existing }] = await Promise.all([
    admin.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle(),
    admin.from('trainer_profiles').select('id,business_name,verification_status').eq('id', user.id).maybeSingle(),
    admin.from('trainer_verification_submissions').select('id,status,agreement_sent_at').eq('trainer_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('trainer_agreement_versions').select('version').eq('is_current', true).maybeSingle(),
    admin.from('trainer_agreement_acceptances').select('id,trainer_signed_at').eq('trainer_id', user.id).eq('agreement_version', TRAINER_AGREEMENT_VERSION).maybeSingle(),
  ]);

  if (!profile || !trainer) back('Du har ikke tilgang til treneravtalen.', true);
  const approvedTrainer = profile.role === 'trainer' && ['approved', 'suspended'].includes(trainer.verification_status || '');
  const invitedApplicant = latest?.status === 'pending' && Boolean(latest.agreement_sent_at);
  if (!approvedTrainer && !invitedApplicant) back('Hundetimer må sende treneravtalen til deg før du kan signere den.', true);
  if (!currentVersion || currentVersion.version !== TRAINER_AGREEMENT_VERSION) back('Avtaleversjonen er ikke synkronisert. Kontakt Hundetimer.', true);
  if (existing?.trainer_signed_at) back('Du har allerede signert denne versjonen av treneravtalen.');

  const snapshot = trainerAgreementPlainText();
  const contentHash = createHash('sha256').update(snapshot, 'utf8').digest('hex');
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip')?.trim() || null;
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 1000) || null;
  const now = new Date().toISOString();

  const signature = {
    trainer_id: user.id,
    agreement_version: TRAINER_AGREEMENT_VERSION,
    agreement_snapshot: snapshot,
    content_sha256: contentHash,
    ip_address: forwardedFor,
    user_agent: userAgent,
    acceptance_method: 'clickwrap',
    trainer_signature_name: signatureName,
    trainer_signed_at: now,
  };
  const { data: acceptance, error } = existing
    ? await admin.from('trainer_agreement_acceptances').update(signature).eq('id', existing.id).is('trainer_signed_at', null).select('id').single()
    : await admin.from('trainer_agreement_acceptances').insert(signature).select('id').single();
  if (error || !acceptance) back(error?.message || 'Kunne ikke registrere signaturen.', true);

  if (latest?.id) {
    await admin.from('trainer_verification_submissions').update({ agreement_acceptance_id: acceptance.id }).eq('id', latest.id);
  }

  await bestEffortNotification({
    userId: user.id,
    type: 'verification',
    title: 'Treneravtalen er signert',
    body: 'Signaturen din er registrert. Avtalen venter nå på signatur fra Hundetimer.',
    href: '/trainer-dashboard/verification',
    eventKey: `trainer-agreement-signed/${acceptance.id}`,
  });

  revalidatePath('/vilkar/treneravtale');
  revalidatePath('/bli-trener');
  revalidatePath('/trainer-dashboard/verification');
  revalidatePath('/admin/trainers');
  redirect('/trainer-dashboard/verification?message=Signaturen+din+er+registrert');
}
