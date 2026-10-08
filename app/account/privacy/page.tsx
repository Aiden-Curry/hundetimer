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
    <section className="page-heading"><h1>Personvern og konto</h1><p className="muted">Her bestemmer du hvilke e-poster du vil få fra oss. Du kan også laste ned opplysningene som er knyttet til kontoen din, eller be om å slette kontoen.</p></section>
    {params.message ? <div className="notice success" role="status">{params.message}</div> : null}
    {params.error ? <div className="notice error" role="alert">{params.error}</div> : null}

    <div className="privacy-sections"><section className="dashboard-section"><div className="section-title"><div><h2>Last ned en kopi av opplysningene dine</h2></div></div>
      <p className="muted">Vil du se hva som er lagret om kontoen din? Nedlastingen samler blant annet profilen din, hundene dine, bestillinger, meldinger, vurderinger, lagrede favoritter og fremdrift i nettkurs. Har du en trenerprofil, følger også opplysninger knyttet til den med.</p>
      <p className="muted">Du får en JSON-fil. Det er en tekstfil med dataene ordnet etter kategori, og den kan åpnes i et tekstprogram. Lenker og referanser til vedlegg er med, men selve vedleggene lastes ikke ned. Kortopplysninger hos Stripe er heller ikke inkludert.</p>
      <p className="muted">Nedlastingen endrer ikke kontoen din. Ta vare på filen et sted du har kontroll over, siden den kan inneholde private meldinger og andre personopplysninger.</p>
      <a className="btn" href="/account/privacy/export">Last ned opplysningene mine</a></section>

    <section className="dashboard-section"><div className="section-title"><div><h2>E-post og frivillige valg</h2></div></div>
      <p className="muted">Kryss av for det du ønsker, og trykk «Lagre valg». Vil du slutte å motta noe, fjerner du krysset og lagrer på nytt. Du trenger ikke slette kontoen for å melde deg av nyhetsbrevet.</p>
      <form action={savePrivacyPreferencesAction} className="stacked-form">
      <label className="checkbox-row"><input type="checkbox" name="marketingEmail" defaultChecked={Boolean(prefs?.marketing_email)}/><span><strong>Nyhetsbrev og tilbud fra Hundetimer</strong><small>E-post om nye kurs, hundetrenere, aktiviteter og tilbud. Du kan også melde deg av via lenken i nyhetsbrevet.</small></span></label>
      <label className="checkbox-row"><input type="checkbox" name="productUpdates" defaultChecked={Boolean(prefs?.product_updates)}/><span><strong>Nytt om Hundetimer</strong><small>E-post om nye funksjoner og endringer i tjenesten, for eksempel nye måter å bestille eller følge opp treningen på.</small></span></label>
      <label className="checkbox-row"><input type="checkbox" name="analyticsConsent" defaultChecked={Boolean(prefs?.analytics_consent)}/><span><strong>Frivillig analyse</strong><small>Dette lagrer et samtykke på kontoen din for eventuell analyse senere. Ingen slik analyse er aktivert nå. Informasjonskapsler i nettleseren har egne innstillinger.</small></span></label>
      <p className="muted small">Du får fortsatt nødvendige beskjeder om bestillinger, betalinger og sikkerheten til kontoen din. Disse e-postene kan ikke slås av her. Nyhetsbrev du har meldt deg på hos en trener, har en egen avmeldingslenke.</p>
      <SubmitButton className="btn" type="submit">Lagre valg</SubmitButton>
    </form><p className="muted small">Vil du endre hvilke informasjonskapsler nettleseren tillater? <Link href="/personvern#samtykke">Åpne innstillingene på personvernsiden</Link>.</p></section>

    <section className="dashboard-section danger-zone"><div className="section-title"><div><h2>Slett kontoen din</h2></div></div>
      <p className="muted">Når kontoen slettes, mister du tilgang til kjøpte nettkurs og historikken på Min side. Last gjerne ned opplysningene dine først hvis du vil beholde en kopi.</p>
      <p className="muted">Noen opplysninger om betalinger, refusjoner, utbetalinger og saker som er behandlet av Hundetimer, kan beholdes i anonymisert eller begrenset form. Sletting av kontoen fjerner derfor ikke nødvendigvis alle spor etter tidligere kjøp.</p>
      {activeDeletion ? <div className="notice"><strong>{deletionText[deletion.status] || deletion.status}</strong><p>{deletion.status === 'requires_review' ? 'Vi har mottatt forespørselen din. En administrator må se gjennom trenerkontoen før den kan slettes, slik at kunder, kurs og eventuelle utbetalinger blir håndtert.' : `Kontoen er planlagt slettet ${deletion.scheduled_for ? new Intl.DateTimeFormat('nb-NO',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(deletion.scheduled_for)) : 'etter ventetiden'}.`}</p><p>Har du ombestemt deg, kan du avbryte forespørselen her så lenge slettingen ikke er fullført.</p><form action={cancelAccountDeletionAction}><SubmitButton className="btn secondary" type="submit">Avbryt kontosletting</SubmitButton></form></div> : <>
        <p className="muted">For hundeeiere planlegges slettingen 7 dager etter at forespørselen er sendt. Du kan komme tilbake hit og avbryte i mellomtiden. Aktive privattimer, kurspåmeldinger og ventelisteplasser må være avsluttet først. Har du en refusjon som behandles, må du vente til den er ferdig.</p>
        <p className="muted">Har du trenerkonto, går forespørselen først til en administrator. Vi må se gjennom kunder, publiserte kurs og utbetalinger før kontoen kan slettes.</p>
        {profile?.role === 'admin' ? <p className="notice">Administratorkontoer må håndteres manuelt og kan ikke slettes her.</p> : <form action={requestAccountDeletionAction} className="stacked-form"><label>For å bekrefte, skriv <strong>SLETT</strong><input name="confirmation" required autoComplete="off" placeholder="SLETT" /></label><SubmitButton className="btn danger" type="submit">Be om å slette kontoen</SubmitButton></form>}
      </>}
    </section>
    </div><p><Link href={profile?.role === 'admin' ? '/admin/moderation' : '/account'}>← Tilbake</Link></p>
  </main>;
}
