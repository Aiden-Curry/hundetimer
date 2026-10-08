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
  { icon: CalendarDays, title: 'Booking og kalender', text: 'Se når du har timer, og legg inn avtaler du får på telefon eller andre steder.' },
  { icon: Users, title: 'Kunder og oppfølging', text: 'Finn igjen kunden, hunden og notatene fra forrige time. Meldinger om bestillingen ligger også her.' },
  { icon: GraduationCap, title: 'Privattimer, kurs og nettkurs', text: 'Lag en profil der hundeeiere kan lese om deg, se hva du tilbyr og bestille trening.' },
];

const steps = [
  ['Logg inn eller opprett en konto', 'Har du allerede en konto, bruker du den. Du kan være både hundeeier og trener med samme innlogging.'],
  ['Send søknaden', 'Fortell litt om deg selv, erfaringen din og hva slags trening du vil tilby.'],
  ['Vi leser søknaden din', 'Du kan følge med på søknadsstatusen på kontoen din mens vi går gjennom opplysningene.'],
  ['Signer treneravtalen', 'Går søknaden videre, får du avtalen på kontoen din. Du leser og signerer først. Deretter signerer vi.'],
  ['Vi gjør en siste vurdering', 'Når begge har signert, vurderer vi søknaden for endelig godkjenning.'],
  ['Sett opp utbetaling hos Stripe', 'Når du er godkjent, fyller du inn opplysningene Stripe trenger for å kunne betale deg.'],
  ['Ta i bruk trenerområdet', 'Når Stripe bekrefter at kontoen er klar, får du tilgang til å redigere profilen, legge inn tilbud og håndtere bestillinger.'],
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
      <div><h1>Tilby hundetrening på Hundetimer</h1><p>Jobber du som hundetrener? På Hundetimer kan kunder finne deg og bestille privattimer, kurs og nettkurs. Du får en kalender for avtalene dine og oversikt over kunder og betalinger.</p><div className="trainer-sales-actions"><Link className="btn" href={ctaHref}>{ctaText}<ArrowRight size={17} aria-hidden="true" /></Link><a className="ta-text-link" href="#pris">Hva koster det?</a></div></div>
      <aside className="ta-price-intro" aria-label="Prismodell"><span>Ingen månedsavgift</span><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} %</strong><p>i provisjon når du selger gjennom Hundetimer</p><div>Ingen provisjon på avtaler du legger inn selv</div></aside>
    </header>

    <section className="ta-features" aria-label="Verktøy for hundetrenere">{features.map(({icon:Icon,title,text}) => <article key={title}><Icon size={22} aria-hidden="true" /><h2>{title}</h2><p>{text}</p></article>)}</section>

    <section className="ta-pricing" id="pris" aria-labelledby="ta-pricing-title"><div className="ta-section-heading"><h2 id="ta-pricing-title">Priser og utbetaling</h2><p>Du betaler ikke for å opprette en trenerprofil, og det er ingen fast månedspris.</p></div><div className="ta-price-columns"><div><h3>Salg gjennom Hundetimer</h3><p><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} % av salgsprisen</strong> er provisjonen for privattimer, kurs, arrangementer og nettkurs som selges gjennom Hundetimer. Kunden betaler et servicegebyr på {CUSTOMER_SERVICE_FEE_NOK} kr i tillegg.</p></div><div><h3>Egne kunder</h3><p><strong>Ingen provisjon på avtaler du registrerer selv.</strong> Har en kunde bestilt direkte hos deg, kan du legge timen inn i kalenderen. Da holdes tiden av, og du kan knytte avtalen til kunden og skrive notater fra treningen.</p></div></div><div className="ta-payout"><h3>Planlagte utbetalinger</h3><dl><div><dt>Fullført 1.–15.</dt><dd>Den 25. samme måned</dd></div><div><dt>Fullført 16.–månedsslutt</dt><dd>Den 10. neste måned</dd></div></dl></div><Link className="ta-text-link" href="/vilkar/treneravtale">Les treneravtalen<ArrowRight size={16} aria-hidden="true" /></Link></section>

    <div className="ta-application-layout"><aside className="ta-process"><h2>Fra søknad til trenerprofil</h2><ol>{steps.map(([title,text],index)=><li key={title}><span aria-hidden="true">{index+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></aside>

    <section className="trainer-sales-section" id="soknad">
      <div className="trainer-sales-heading"><h2>Søk om en trenerprofil</h2><p>Fortell oss hvem du er og hva du vil tilby. Du kan bruke kontoen din som vanlig mens vi leser søknaden. Tilgangen til trenerområdet kommer når du er godkjent og utbetalingene hos Stripe er satt opp.</p></div>
      {params.message ? <p className="form-success form-error-block" role="status">{params.message}</p> : null}
      {params.error ? <p className="form-error form-error-block" role="alert">{params.error}</p> : null}

      {!isSupabaseConfigured() ? <div className="notice">Søknadsskjemaet er ikke tilgjengelig akkurat nå. Prøv igjen senere.</div>
      : !user ? <section className="dashboard-section"><h3>Logg inn for å søke</h3><p className="muted">Har du brukt Hundetimer før, logger du inn med den samme kontoen. Er du ny her, oppretter du en konto først og kommer tilbake hit for å fylle ut søknaden.</p><div className="trainer-sales-actions"><Link className="btn" href="/login?next=/bli-trener">Logg inn</Link><Link className="btn secondary" href="/register?next=/bli-trener">Opprett konto</Link></div></section>
      : journey && ['pending', 'approved', 'suspended'].includes(status) ? <TrainerJourney journey={journey} compact />
      : <form className="verification-form" action={submitTrainerApplicationAction}><p className="ta-required-note">Fyll inn navn, sted, en kort beskrivelse og juridisk navn. Resten er valgfritt, men opplysninger om erfaring og utdanning hjelper oss å vurdere søknaden.</p>
          {status === 'rejected' ? <section className="dashboard-section"><div className="verification-rejected"><strong>Søknaden trenger endringer.</strong><p>{trainer?.verification_review_note || latest?.admin_note || 'Se over opplysningene og send inn søknaden på nytt.'}</p></div></section> : null}
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">1. Trenerprofil</span><h3>Dette får kundene vite om deg</h3></div></div><div className="form-grid"><label>Navn på trener eller virksomhet<input name="businessName" required defaultValue={trainer?.business_name || profile?.display_name || ''} /></label><label>Sted<input name="city" required defaultValue={trainer?.city || ''} placeholder="Hamar" /></label><label className="full">Fortell om deg selv og treningen din<textarea name="bio" rows={5} required defaultValue={trainer?.bio || ''} placeholder="Hva slags trening tilbyr du? Hvordan jobber du med hund og eier?" /></label><label className="full">Hva jobber du mest med? (Skill med komma)<input name="specialties" defaultValue={(trainer?.specialties || []).join(', ')} placeholder="Valp, passeringstrening, innkalling" /></label></div></section>
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">2. Søknad</span><h3>Erfaring og bakgrunn</h3></div></div><p className="muted small">Her vil vi gjerne vite litt mer om bakgrunnen din. Vi bruker opplysningene til å vurdere søknaden. De blir ikke automatisk lagt ut på trenerprofilen.</p><div className="form-grid"><label>Juridisk navn (fullt navn eller registrert firmanavn)<input name="legalName" required defaultValue={trainer?.business_name || profile?.display_name || ''} /></label><label>Organisasjonsnummer<input name="organisationNumber" inputMode="numeric" maxLength={9} placeholder="9 siffer, hvis relevant" /></label><label>Hvor mange år har du jobbet med hundetrening?<input name="yearsExperience" type="number" min="0" max="80" placeholder="For eksempel 5" /></label><label className="full">Relevant utdanning og erfaring<textarea name="qualifications" rows={5} placeholder="Skriv om kurs eller utdanning du har tatt, og erfaring du har med å trene hunder og veilede eiere." /></label><label className="full">Er det noe mer du vil fortelle oss?<textarea name="note" rows={4} placeholder="Her kan du legge til noe vi bør vite når vi leser søknaden." /></label></div></section>
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">3. Send inn</span><h3>Send søknaden til Hundetimer</h3></div></div><p className="muted">Når du sender inn, går søknaden til oss for vurdering. Hvis den går videre, får du treneravtalen på kontoen din. Du og Hundetimer må begge signere før søknaden kan godkjennes.</p><div className="editor-actions"><button className="btn" type="submit">{status === 'rejected' ? 'Send søknaden på nytt' : 'Send søknad'}</button></div></section>
        </form>}
    </section>
    </div>
  </main>;
}
