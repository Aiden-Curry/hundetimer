import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TRAINER_AGREEMENT_VERSION } from '@/lib/legal/trainer-agreement';

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

export default async function TrainerAgreementDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/agreement');

  const { data: agreement } = await supabase
    .from('trainer_agreement_acceptances')
    .select('id,agreement_version,trainer_signature_name,trainer_signed_at,admin_signature_name,admin_signed_at')
    .eq('trainer_id', user.id)
    .eq('agreement_version', TRAINER_AGREEMENT_VERSION)
    .maybeSingle();

  return <main className="dashboard editor-page">
    <section className="dashboard-heading"><div><span className="eyebrow">Avtale</span><h1>Treneravtale</h1><p className="muted">Her finner du avtalen som gjelder mellom deg og Hundetimer.</p></div></section>

    <section className="dashboard-section">
      {agreement ? <>
        <div className="section-title"><div><span className="eyebrow">Versjon {agreement.agreement_version}</span><h2>{agreement.trainer_signed_at && agreement.admin_signed_at ? 'Signert treneravtale' : 'Avtale til signering'}</h2></div><a className="btn secondary compact" href={`/trainer-agreement/${agreement.id}`}>Last ned PDF</a></div>
        <div className="agreement-signing-steps">
          <div className={agreement.trainer_signed_at ? 'agreement-step is-complete' : 'agreement-step'}><strong>Din signatur</strong><span>{agreement.trainer_signed_at ? `${agreement.trainer_signature_name || 'Trener'} · ${dateTime(agreement.trainer_signed_at)}` : 'Ikke registrert'}</span></div>
          <div className={agreement.admin_signed_at ? 'agreement-step is-complete' : 'agreement-step'}><strong>Hundetimers signatur</strong><span>{agreement.admin_signed_at ? `${agreement.admin_signature_name || 'Hundetimer'} · ${dateTime(agreement.admin_signed_at)}` : 'Ikke registrert'}</span></div>
        </div>
        <div className="editor-actions"><Link className="btn" href="/vilkar/treneravtale">Les avtalen</Link></div>
      </> : <div className="empty-state compact-empty"><h3>Ingen signert treneravtale funnet</h3><p className="muted">Kontakt Hundetimer dersom du mener dette er feil.</p></div>}
    </section>
  </main>;
}
