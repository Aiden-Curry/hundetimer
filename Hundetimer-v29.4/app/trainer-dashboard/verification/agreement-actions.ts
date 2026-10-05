'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';
import { TRAINER_AGREEMENT_VERSION, trainerAgreementPlainText } from '@/lib/legal/trainer-agreement';

function back(message: string, error = false): never {
  redirect(`/trainer-dashboard/verification?${error ? 'error' : 'message'}=${encodeURIComponent(message)}`);
}

function esc(value: string) { return value.replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch] || ch)); }

export async function acceptTrainerAgreementAction(formData: FormData) {
  if (formData.get('acceptAgreement') !== 'on') back('Du må bekrefte at du har lest og godtar treneravtalen.', true);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/verification');
  const admin = createAdminClient();
  const [{ data: profile }, { data: trainer }, { data: currentVersion }] = await Promise.all([
    admin.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle(),
    admin.from('trainer_profiles').select('id,business_name').eq('id', user.id).maybeSingle(),
    admin.from('trainer_agreement_versions').select('version').eq('is_current', true).maybeSingle(),
  ]);
  if (profile?.role !== 'trainer' || !trainer) back('Du må ha en trenerprofil før du kan godta treneravtalen.', true);
  if (!currentVersion || currentVersion.version !== TRAINER_AGREEMENT_VERSION) back('Avtaleversjonen er ikke synkronisert. Kontakt Hundetimer før du fortsetter.', true);

  const snapshot = trainerAgreementPlainText();
  const contentHash = createHash('sha256').update(snapshot, 'utf8').digest('hex');
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip')?.trim() || null;
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 1000) || null;

  const { data: existing } = await admin.from('trainer_agreement_acceptances').select('id,accepted_at').eq('trainer_id', user.id).eq('agreement_version', TRAINER_AGREEMENT_VERSION).order('accepted_at', { ascending: false }).limit(1).maybeSingle();
  let acceptance = existing;
  if (!acceptance) {
    const { data, error } = await admin.from('trainer_agreement_acceptances').insert({
      trainer_id: user.id,
      agreement_version: TRAINER_AGREEMENT_VERSION,
      agreement_snapshot: snapshot,
      content_sha256: contentHash,
      ip_address: forwardedFor,
      user_agent: userAgent,
      acceptance_method: 'clickwrap',
    }).select('id,accepted_at').single();
    if (error || !data) back(error?.message || 'Kunne ikke registrere avtalen.', true);
    acceptance = data;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  if (user.email && acceptance) {
    try {
      const downloadUrl = `${baseUrl}/trainer-agreement/${acceptance.id}`;
      await sendTransactionalEmail({
        to: user.email,
        subject: `Treneravtale v${TRAINER_AGREEMENT_VERSION} er registrert`,
        idempotencyKey: `trainer-agreement/${acceptance.id}`,
        html: `<!doctype html><html lang="nb"><body style="margin:0;background:#f7f3eb;font-family:Arial,Helvetica,sans-serif;color:#2d2d2d"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fffdfc;border-radius:22px;padding:34px"><p style="margin:0 0 12px;color:#8fa892;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Hundetimer</p><h1 style="font-size:28px;margin:0 0 16px">Treneravtalen er registrert</h1><p style="line-height:1.6">Hei ${esc(trainer.business_name || profile.display_name || 'trener')}. Du har akseptert treneravtale versjon ${TRAINER_AGREEMENT_VERSION}. Du kan nå fortsette med trenerverifiseringen.</p><p style="margin:26px 0"><a href="${esc(downloadUrl)}" style="display:inline-block;background:#234033;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">Last ned din avtale</a></p><p style="color:#6d756f;font-size:13px">Aksept-ID: ${esc(acceptance.id)}</p></div></div></body></html>`,
        text: `Hundetimer\n\nDu har akseptert treneravtale versjon ${TRAINER_AGREEMENT_VERSION}. Last ned din kopi: ${downloadUrl}\nAksept-ID: ${acceptance.id}`,
      });
    } catch (emailError) {
      console.error('Trainer agreement confirmation email failed', emailError);
    }
  }

  revalidatePath('/trainer-dashboard/verification');
  back('Treneravtalen er godkjent. Du kan nå sende inn verifiseringen.');
}
