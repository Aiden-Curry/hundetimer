import { SubmitButton } from '@/components/submit-button';
import { CustomerNavigation } from '@/components/customer-navigation';
import '@/components/customer-pages.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cancelAccountDeletionAction, requestAccountDeletionAction, savePrivacyPreferencesAction } from './actions';

const deletionText: Record<string,string> = {
  pending: 'Planlagt sletting', requires_review: 'Venter på administrator', cancelled: 'Avbrutt', completed: 'Fullført', rejected: 'Avvist'
};

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/privacy');
  const [{ data: profile }, { data: prefs }, { data: deletion }] = await Promise.all([
    supabase.from('profiles').select('display_name,role').eq('id', user.id).maybeSingle(),
    supabase.from('privacy_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('account_deletion_requests').select('*').eq('user_id', user.id).maybeSingle(),
  ]);
  const params = await searchParams;
  const activeDeletion = deletion && ['pending','requires_review'].includes(deletion.status);
  return <main className="page-shell narrow customer-page"><CustomerNavigation current="/account/privacy" />
    <section className="page-heading"><span className="eyebrow">Personvern og konto</span><h1>Personvern og konto</h1><p className="muted">Last ned dataene dine, velg frivillig kommunikasjon og administrer kontosletting.</p></section>
    {params.message ? <div className="notice success">{params.message}</div> : null}
    {params.error ? <div className="notice error">{params.error}</div> : null}

    <div className="privacy-sections"><section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Dataeksport</span><h2>Last ned dataene dine</h2></div></div><p className="muted">Eksporten inneholder kontoprofil, hunder, bestillinger, meldinger, vurderinger, kurs/nettkurs, varsler og andre personopplysninger knyttet til kontoen. Betalingskortdata lagres hos Stripe og er derfor ikke med.</p><a className="btn" href="/account/privacy/export">Last ned JSON-eksport</a></section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Samtykker</span><h2>Frivillig kommunikasjon</h2></div></div><form action={savePrivacyPreferencesAction} className="stacked-form">
      <label className="checkbox-row"><input type="checkbox" name="marketingEmail" defaultChecked={Boolean(prefs?.marketing_email)}/><span><strong>Nyhetsbrev og tilbud fra Hundetimer</strong><small>Tilbud, kampanjer og inspirasjon. Kan slås av når som helst.</small></span></label>
      <label className="checkbox-row"><input type="checkbox" name="productUpdates" defaultChecked={Boolean(prefs?.product_updates)}/><span><strong>Produktnyheter</strong><small>Nyheter om nye funksjoner og endringer på plattformen.</small></span></label>
      <label className="checkbox-row"><input type="checkbox" name="analyticsConsent" defaultChecked={Boolean(prefs?.analytics_consent)}/><span><strong>Frivillig analyse</strong><small>Kan brukes senere for ikke-nødvendig analyse. Ingen slik analyse er aktivert nå.</small></span></label>
      <p className="muted small">Nødvendige e-poster om bestillinger, betaling, sikkerhet og konto kan ikke slås av så lenge kontoen er aktiv.</p>
      <SubmitButton className="btn" type="submit">Lagre valg</SubmitButton>
    </form></section>

    <section className="dashboard-section danger-zone"><div className="section-title"><div><span className="eyebrow">Faresone</span><h2>Slett konto</h2></div></div>
      {activeDeletion ? <div className="notice"><strong>{deletionText[deletion.status] || deletion.status}</strong><p>{deletion.status === 'requires_review' ? 'Trenerkontoer må gjennomgås av administrator fordi sletting kan påvirke kunder, nettkurs og utbetalinger.' : `Kontoen er planlagt slettet ${deletion.scheduled_for ? new Intl.DateTimeFormat('nb-NO',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(deletion.scheduled_for)) : ''}.`}</p><form action={cancelAccountDeletionAction}><SubmitButton className="btn secondary" type="submit">Avbryt kontosletting</SubmitButton></form></div> : <>
        <p className="muted">Hundeeiere får 7 dagers angrefrist. Trenerkontoer sendes først til administrator fordi kundetilgang, økonomi og publisert innhold må håndteres forsvarlig. Tilgang til kjøpte nettkurs og kontobundet historikk forsvinner når slettingen fullføres. Nødvendige transaksjons-, refusjons-, utbetalings- og modereringsopplysninger kan beholdes i anonymisert eller begrenset form.</p>
        {profile?.role === 'admin' ? <p className="notice">Administratorkontoer må håndteres manuelt og kan ikke slettes her.</p> : <form action={requestAccountDeletionAction} className="stacked-form"><label>For å bekrefte, skriv <strong>SLETT</strong><input name="confirmation" required autoComplete="off" placeholder="SLETT" /></label><SubmitButton className="btn danger" type="submit">Be om å slette kontoen</SubmitButton></form>}
      </>}
    </section>
    </div><p><Link href={profile?.role === 'admin' ? '/admin/moderation' : '/account'}>← Tilbake</Link></p>
  </main>;
}
