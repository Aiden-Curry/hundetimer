import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';
import { bestEffortNotification } from '@/lib/notifications/server';

function baseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export async function notifyTrainerVerificationDecision(trainerId: string, submissionId: string, status: 'approved' | 'rejected', note?: string | null) {
  const admin = createAdminClient();
  const [{ data: authData }, { data: trainer }] = await Promise.all([
    admin.auth.admin.getUserById(trainerId),
    admin.from('trainer_profiles').select('business_name').eq('id', trainerId).maybeSingle(),
  ]);
  const email = authData.user?.email || null;
  const businessName = trainer?.business_name || 'trenerprofilen din';
  if (status === 'approved') {
    await bestEffortNotification({ userId: trainerId, type: 'verification', title: 'Trenerprofilen din er verifisert', body: `${businessName} er godkjent og er nå synlig i markedsplassen.`, href: '/trainer-dashboard', eventKey: `trainer-verification-approved-${submissionId}` });
    if (email) await sendTransactionalEmail({
      to: email,
      subject: 'Trenerprofilen din er verifisert',
      idempotencyKey: `trainer-verification-approved-${submissionId}`,
      text: `${businessName} er godkjent og er nå synlig i markedsplassen.`,
      html: `<h2>Du er verifisert ✓</h2><p><strong>${businessName}</strong> er godkjent og er nå synlig i markedsplassen.</p>${note ? `<p>${note}</p>` : ''}<p><a href="${baseUrl()}/trainer-dashboard">Åpne trenerdashbordet</a></p>`,
    });
  } else {
    await bestEffortNotification({ userId: trainerId, type: 'verification', title: 'Verifiseringen trenger endringer', body: note || `Søknaden for ${businessName} trenger mer informasjon.`, href: '/trainer-dashboard/verification', eventKey: `trainer-verification-rejected-${submissionId}` });
    if (email) await sendTransactionalEmail({
      to: email,
      subject: 'Trenerverifiseringen trenger endringer',
      idempotencyKey: `trainer-verification-rejected-${submissionId}`,
      text: `Søknaden for ${businessName} trenger endringer. ${note || ''}`,
      html: `<h2>Vi trenger litt mer informasjon</h2><p>Søknaden for <strong>${businessName}</strong> er sendt tilbake.</p>${note ? `<div style="padding:12px 16px;background:#f6f6f6;border-radius:10px"><strong>Tilbakemelding:</strong><br>${note}</div>` : ''}<p><a href="${baseUrl()}/trainer-dashboard/verification">Oppdater søknaden</a></p>`,
    });
  }
}
