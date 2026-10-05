import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TrainerVerificationForm } from '@/components/trainer-verification-form';
import { TRAINER_AGREEMENT_EFFECTIVE_LABEL, TRAINER_AGREEMENT_VERSION } from '@/lib/legal/trainer-agreement';
import { acceptTrainerAgreementAction } from './agreement-actions';

type VerificationStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected' | 'suspended';

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

export default async function TrainerVerificationPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/verification');

  const [{ data: account }, { data: trainer }, { data: latest }, { data: agreement }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('business_name, verification_status, verification_review_note').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_verification_submissions').select('status, submitted_at, admin_note').eq('trainer_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('trainer_agreement_acceptances').select('id,agreement_version,accepted_at').eq('trainer_id', user.id).eq('agreement_version', TRAINER_AGREEMENT_VERSION).order('accepted_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (account?.role !== 'trainer' || !trainer) redirect('/trainer-onboarding');
  const params = await searchParams;
  const status = (trainer.verification_status || 'not_submitted') as VerificationStatus;

  return <main className="dashboard editor-page">
    <section className="dashboard-heading">
      <div><Link className="back-link compact-back" href="/trainer-dashboard">← Tilbake til dashbord</Link><span className="eyebrow">Trenerverifisering</span><h1>Bli en verifisert hundetrener</h1><p className="muted">Verifiserte profiler kan vises offentlig og ta imot bestillinger gjennom markedsplassen.</p></div>
    </section>
    {params.message ? <div className="notice success dashboard-flash">{params.message}</div> : null}
    {params.error ? <div className="notice error dashboard-flash">{params.error}</div> : null}

    {status !== 'approved' && status !== 'suspended' ? <section className={`dashboard-section agreement-gate-card${agreement ? ' is-complete' : ''}`}>
      <div className="agreement-gate-number">1</div>
      <div className="agreement-gate-copy"><span className="eyebrow">Før verifisering</span><h2>Les og godta treneravtalen</h2><p className="muted">Pris, utbetaling, ansvar og bruk av Hundetimer skal være tydelig før du sender inn dokumentasjon.</p>
        {agreement ? <div className="agreement-accepted"><div><strong>Treneravtale v{agreement.agreement_version} er godkjent ✓</strong><span>Registrert {dateTime(agreement.accepted_at)}</span></div><a className="btn secondary compact" href={`/trainer-agreement/${agreement.id}`}>Last ned kopi</a></div> : <>
          <div className="agreement-gate-links"><Link className="text-link" href="/bli-trener">Se hvordan Hundetimer fungerer →</Link><Link className="text-link" href="/vilkar/treneravtale">Les treneravtale v{TRAINER_AGREEMENT_VERSION} →</Link></div>
          <form action={acceptTrainerAgreementAction} className="agreement-accept-form"><label className="checkbox-row"><input type="checkbox" name="acceptAgreement" /><span><strong>Jeg har lest og godtar treneravtalen</strong><small>Versjon {TRAINER_AGREEMENT_VERSION}, gjelder fra {TRAINER_AGREEMENT_EFFECTIVE_LABEL}. Aksepten registreres elektronisk og du får en kopi.</small></span></label><button className="btn" type="submit">Godta treneravtalen</button></form>
        </>}
      </div>
    </section> : null}

    {agreement || status === 'approved' || status === 'pending' || status === 'suspended'
      ? <div className="verification-after-agreement"><div className="agreement-gate-number muted-step">2</div><div><span className="eyebrow">Verifisering</span><h2>Send inn virksomhetsopplysninger</h2></div></div>
      : <div className="verification-locked"><strong>Verifiseringen åpnes etter at treneravtalen er godkjent.</strong><p className="muted small">Du kan lese hele avtalen før du bestemmer deg.</p></div>}

    {agreement || status === 'approved' || status === 'pending' || status === 'suspended'
      ? <TrainerVerificationForm status={status} businessName={trainer.business_name} latestSubmission={latest || null} reviewNote={trainer.verification_review_note} />
      : null}
  </main>;
}
