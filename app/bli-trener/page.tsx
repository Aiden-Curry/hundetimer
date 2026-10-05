import { getTrainerJourney } from '@/lib/trainer-journey-server';
import { TrainerJourney } from '@/components/trainer-journey';
import Link from 'next/link';
import './application.css';
import { ArrowRight, CalendarDays, GraduationCap, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { CUSTOMER_SERVICE_FEE_NOK, MARKETPLACE_COMMISSION_PERCENT } from '@/lib/legal/trainer-agreement';
import { submitTrainerApplicationAction } from './actions';

const features = [
  { icon: CalendarDays, title: 'Booking og kalender', text: 'Samle bestillinger fra Hundetimer og egne avtaler i samme kalender.' },
  { icon: Users, title: 'Kunder og oppfølging', text: 'Hold oversikt over kunder, hunder, treningsjournal og meldinger.' },
  { icon: GraduationCap, title: 'Dine treningstilbud', text: 'Tilby privattimer, gruppeaktiviteter og nettkurs fra en offentlig trenerprofil.' },
];

const steps = [
  ['Bruk din vanlige Hundetimer-konto', 'Du trenger ikke en egen trenerinnlogging. Den samme kontoen brukes både som kunde og trener.'],
  ['Send søknaden', 'Fortell hvem du er, hvor du holder til, erfaringen din og hva du ønsker å tilby.'],
  ['Hundetimer vurderer søknaden', 'Vi går gjennom opplysningene dine før vi sender deg treneravtalen.'],
  ['Signer treneravtalen', 'Hvis søknaden går videre sender Hundetimer avtalen til kontoen din. Du leser og signerer den elektronisk, deretter signerer Hundetimer.'],
  ['Hundetimer godkjenner søknaden', 'Etter begge signaturene får søknaden en endelig vurdering.'],
  ['Sett opp utbetaling hos Stripe', 'Etter godkjenning legger du inn virksomhets- og utbetalingsopplysninger hos Stripe.'],
  ['Trenerdashboardet åpnes', 'Når Stripe-kontoen er klar, kan du administrere profil, tjenester og bestillinger.'],
];

type TrainerApplicationProfile = { business_name: string; city: string; bio: string | null; specialties: string[] | null; verification_status: Status; verification_review_note: string | null };

type Status = 'not_submitted' | 'pending' | 'approved' | 'rejected' | 'suspended';

export default async function BecomeTrainerPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const params = await searchParams;
  let user: { id: string } | null = null;
  let profile: { role: string; display_name: string } | null = null;
  let trainer: TrainerApplicationProfile | null = null;
  let latest: { id: string; submitted_at: string; admin_note: string | null; agreement_sent_at: string | null } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    user = auth.data.user ? { id: auth.data.user.id } : null;
    if (user) {
      const [profileResult, trainerResult, latestResult] = await Promise.all([
        supabase.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle(),
        supabase.from('trainer_profiles').select('business_name,city,bio,specialties,verification_status,verification_review_note').eq('id', user.id).maybeSingle(),
        supabase.from('trainer_verification_submissions').select('id,submitted_at,admin_note,agreement_sent_at').eq('trainer_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      profile = profileResult.data;
      trainer = trainerResult.data as TrainerApplicationProfile | null;
      latest = latestResult.data;
    }
  }

  const journey = user ? await getTrainerJourney() : null;
  const status = trainer?.verification_status || 'not_submitted';
  const hasTrainerAccess = journey?.stage === 'ready';
  const ctaHref = !user ? '/login?next=/bli-trener' : hasTrainerAccess ? '/trainer-dashboard' : '#soknad';
  const ctaText = !user ? 'Logg inn og søk' : hasTrainerAccess ? 'Åpne trenerområdet' : status === 'pending' ? 'Se søknadsstatus' : 'Søk om å bli trener';

  return <main className="page-shell trainer-application-page">
    <header className="ta-hero">
      <div><h1>Bli hundetrener på Hundetimer</h1><p>Gjør treningstilbudene dine synlige for nye kunder, og samle booking, betaling og oppfølging på ett sted.</p><div className="trainer-sales-actions"><Link className="btn" href={ctaHref}>{ctaText}<ArrowRight size={17} aria-hidden="true" /></Link><a className="ta-text-link" href="#pris">Se priser og utbetaling</a></div></div>
      <aside className="ta-price-intro" aria-label="Prismodell"><span>Ingen månedsavgift</span><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} %</strong><p>provisjon på salg via markedsplassen</p><div>0 % på egne, manuelt registrerte kunder</div></aside>
    </header>

    <section className="ta-features" aria-label="Verktøy for hundetrenere">{features.map(({icon:Icon,title,text}) => <article key={title}><Icon size={22} aria-hidden="true" /><h2>{title}</h2><p>{text}</p></article>)}</section>

    <section className="ta-pricing" id="pris" aria-labelledby="ta-pricing-title"><div className="ta-section-heading"><h2 id="ta-pricing-title">Priser og utbetaling</h2><p>Ingen oppstartsavgift eller fast månedspris.</p></div><div className="ta-price-columns"><div><h3>Salg gjennom Hundetimer</h3><p><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} % av salgsprisen</strong> for privattimer, kurs, arrangementer og nettkurs som selges gjennom markedsplassen. Kunden betaler et servicegebyr på {CUSTOMER_SERVICE_FEE_NOK} kr i tillegg.</p></div><div><h3>Egne kunder</h3><p><strong>Ingen markedsplassprovisjon.</strong> Registrer avtaler fra telefon, sosiale medier eller eksisterende kunder. Avtalene blokkerer kalenderen og kan knyttes til kundehistorikk og treningsjournal.</p></div></div><div className="ta-payout"><h3>Planlagte utbetalinger</h3><dl><div><dt>Fullført 1.–15.</dt><dd>Den 25. samme måned</dd></div><div><dt>Fullført 16.–månedsslutt</dt><dd>Den 10. neste måned</dd></div></dl></div><Link className="ta-text-link" href="/vilkar/treneravtale">Les treneravtalen<ArrowRight size={16} aria-hidden="true" /></Link></section>

    <div className="ta-application-layout"><aside className="ta-process"><h2>Fra søknad til trenerprofil</h2><ol>{steps.map(([title,text],index)=><li key={title}><span aria-hidden="true">{index+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></aside>

    <section className="trainer-sales-section" id="soknad">
      <div className="trainer-sales-heading"><h2>Søknad om trenertilgang</h2><p>Du beholder den vanlige Hundetimer-kontoen din mens søknaden vurderes. Trenerdashboardet åpnes etter godkjenning og fullført utbetalingsoppsett hos Stripe.</p></div>
      {params.message ? <p className="form-success form-error-block" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error form-error-block" role="alert">{params.error}</p> : null}

      {!isSupabaseConfigured() ? <div className="notice">Koble til Supabase før trenersøknader kan sendes.</div>
      : !user ? <section className="dashboard-section"><h3>Logg inn med den vanlige kontoen din</h3><p className="muted">Har du ikke konto ennå, oppretter du en vanlig Hundetimer-konto. Det finnes ikke en separat trenerinnlogging.</p><div className="trainer-sales-actions"><Link className="btn" href="/login?next=/bli-trener">Logg inn</Link><Link className="btn secondary" href="/register?next=/bli-trener">Opprett konto</Link></div></section>
      : journey && ['pending', 'approved', 'suspended'].includes(status) ? <TrainerJourney journey={journey} compact />
      : <form className="verification-form" action={submitTrainerApplicationAction}><p className="ta-required-note">Navn, sted, beskrivelse og juridisk navn er obligatoriske. De øvrige feltene er valgfrie.</p>
          {status === 'rejected' ? <section className="dashboard-section"><div className="verification-rejected"><strong>Søknaden trenger endringer.</strong><p>{trainer?.verification_review_note || latest?.admin_note || 'Se over opplysningene og send inn søknaden på nytt.'}</p></div></section> : null}
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">1. Trenerprofil</span><h3>Hvordan skal kundene bli kjent med deg?</h3></div></div><div className="form-grid"><label>Navn på trener eller virksomhet<input name="businessName" required defaultValue={trainer?.business_name || profile?.display_name || ''} /></label><label>Sted<input name="city" required defaultValue={trainer?.city || ''} placeholder="Hamar" /></label><label className="full">Kort om deg og treningen din<textarea name="bio" rows={5} required defaultValue={trainer?.bio || ''} placeholder="Fortell hvem du hjelper, hvordan du trener og hva kundene kan forvente." /></label><label className="full">Spesialiteter, separert med komma<input name="specialties" defaultValue={(trainer?.specialties || []).join(', ')} placeholder="Valp, passeringstrening, innkalling" /></label></div></section>
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">2. Søknad</span><h3>Opplysninger til Hundetimer</h3></div></div><p className="muted small">Disse opplysningene brukes når vi vurderer søknaden og publiseres ikke automatisk på trenerprofilen.</p><div className="form-grid"><label>Juridisk navn<input name="legalName" required defaultValue={trainer?.business_name || profile?.display_name || ''} /></label><label>Organisasjonsnummer<input name="organisationNumber" inputMode="numeric" maxLength={9} placeholder="9 siffer, hvis relevant" /></label><label>År med erfaring<input name="yearsExperience" type="number" min="0" max="80" placeholder="For eksempel 5" /></label><label className="full">Utdanning, kurs, erfaring og kvalifikasjoner<textarea name="qualifications" rows={5} placeholder="Fortell kort om relevant utdanning, kurs, sertifiseringer og praktisk erfaring." /></label><label className="full">Melding til Hundetimer<textarea name="note" rows={4} placeholder="Valgfritt" /></label></div></section>
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">3. Send inn</span><h3>Send søknaden til Hundetimer</h3></div></div><p className="muted">Treneravtalen sendes til deg først etter at Hundetimer har vurdert søknaden. Du blir ikke trener før avtalen er signert av begge parter og søknaden er endelig godkjent.</p><div className="editor-actions"><button className="btn" type="submit">{status === 'rejected' ? 'Send søknaden på nytt' : 'Send søknad'}</button></div></section>
        </form>}
    </section>
    </div>
  </main>;
}
