import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarDays, CircleDollarSign, GraduationCap, HeartHandshake, LayoutDashboard, Megaphone, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { CUSTOMER_SERVICE_FEE_NOK, MARKETPLACE_COMMISSION_PERCENT, TRAINER_AGREEMENT_VERSION } from '@/lib/legal/trainer-agreement';
import { submitTrainerApplicationAction } from './actions';

const features = [
  { icon: CalendarDays, title: 'Booking og kalender', text: 'Samle markedsplassbestillinger, direktekunder og egne avtaler i samme kalender.' },
  { icon: Users, title: 'Kunder og hunder', text: 'Ha kundehistorikk, hunder, treningsjournal og oppfølging samlet på ett sted.' },
  { icon: GraduationCap, title: 'Privattimer, kurs og nettkurs', text: 'Selg både individuelle timer, gruppeaktiviteter og digitale kurs fra samme profil.' },
  { icon: CircleDollarSign, title: 'Betaling og utbetaling', text: 'Hundetimer holder oversikt over markedsplassalg, provisjon og planlagte utbetalinger.' },
  { icon: Megaphone, title: 'Bli funnet av nye kunder', text: 'En offentlig trenerprofil gjør tjenestene dine søkbare for hundeeiere som leter etter hjelp.' },
  { icon: LayoutDashboard, title: 'Et sted å drive virksomheten', text: 'Dashboard, meldinger, rabatter, nyhetsbrev, vurderinger og økonomi uten separate systemer.' },
];

const steps = [
  ['Bruk din vanlige Hundetimer-konto', 'Du trenger ikke en egen trenerinnlogging. Den samme kontoen brukes både som kunde og trener.'],
  ['Send søknaden', 'Fortell hvem du er, hvor du holder til, erfaringen din og hva du ønsker å tilby.'],
  ['Hundetimer vurderer søknaden', 'Trenertilgang åpnes ikke automatisk. Søknaden må godkjennes av Hundetimer først.'],
  ['Trenerområdet åpnes', 'Når søknaden er godkjent får Min side en inngang til trenerdashboardet, og profilen kan gjøres klar for kunder.'],
];

type Status = 'not_submitted' | 'pending' | 'approved' | 'rejected' | 'suspended';

export default async function BecomeTrainerPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const params = await searchParams;
  let user: { id: string } | null = null;
  let profile: { role: string; display_name: string } | null = null;
  let trainer: { business_name: string; city: string; bio: string | null; specialties: string[] | null; verification_status: Status; verification_review_note: string | null } | null = null;
  let latest: { submitted_at: string; admin_note: string | null } | null = null;
  let agreement: { id: string } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    user = auth.data.user ? { id: auth.data.user.id } : null;
    if (user) {
      const [profileResult, trainerResult, latestResult, agreementResult] = await Promise.all([
        supabase.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle(),
        supabase.from('trainer_profiles').select('business_name,city,bio,specialties,verification_status,verification_review_note').eq('id', user.id).maybeSingle(),
        supabase.from('trainer_verification_submissions').select('submitted_at,admin_note').eq('trainer_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('trainer_agreement_acceptances').select('id').eq('trainer_id', user.id).eq('agreement_version', TRAINER_AGREEMENT_VERSION).maybeSingle(),
      ]);
      profile = profileResult.data;
      trainer = trainerResult.data as typeof trainer;
      latest = latestResult.data;
      agreement = agreementResult.data;
    }
  }

  const status = trainer?.verification_status || 'not_submitted';
  const hasTrainerAccess = profile?.role === 'trainer' && (status === 'approved' || status === 'suspended');
  const ctaHref = !user ? '/login?next=/bli-trener' : hasTrainerAccess ? '/trainer-dashboard' : '#soknad';
  const ctaText = !user ? 'Logg inn og søk' : hasTrainerAccess ? 'Åpne trenerområdet' : status === 'pending' ? 'Se søknadsstatus' : 'Søk om å bli trener';

  return <main className="become-trainer-page">
    <section className="trainer-sales-hero">
      <div className="trainer-sales-copy">
        <span className="eyebrow">For hundetrenere</span>
        <h1>Mer tid til hundene.<br /><em>Mindre administrasjon.</em></h1>
        <p>Hundetimer samler booking, kunder, kalender, kurs, nettkurs og oppfølging, samtidig som nye kunder kan finne deg.</p>
        <div className="trainer-sales-actions"><Link className="btn" href={ctaHref}>{ctaText} <ArrowRight size={18} /></Link><Link className="btn secondary" href="#pris">Se pris og utbetaling</Link></div>
        <div className="trainer-sales-trust"><span><BadgeCheck size={18} /> Godkjente trenerprofiler</span><span><ShieldCheck size={18} /> Tydelige vilkår</span><span><HeartHandshake size={18} /> Ingen månedsavgift</span></div>
      </div>
      <aside className="trainer-sales-summary">
        <span className="eyebrow">Kort fortalt</span>
        <h2>Du trener. Hundetimer holder orden.</h2>
        <div className="trainer-sales-summary-list"><div><strong>0 kr</strong><span>i månedlig abonnement</span></div><div><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} %</strong><span>på salg via markedsplassen</span></div><div><strong>0 %</strong><span>på egne, manuelt registrerte kunder</span></div></div>
        <p className="muted small">Kunden betaler et servicegebyr på {CUSTOMER_SERVICE_FEE_NOK} kr i tillegg ved markedsplasskjøp.</p>
      </aside>
    </section>

    <section className="trainer-sales-section"><div className="trainer-sales-heading"><span className="eyebrow">Alt samlet</span><h2>Bygget for en ekte trenerhverdag</h2><p>Hundetimer er både markedsplass og arbeidsverktøy. Du kan bruke systemet også på kunder som fant deg andre steder.</p></div><div className="trainer-feature-grid">{features.map(({icon:Icon,title,text}) => <article className="trainer-feature-card" key={title}><span className="trainer-feature-icon"><Icon size={23} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

    <section className="trainer-pricing-section" id="pris"><div className="trainer-sales-heading"><span className="eyebrow">Pris</span><h2>En enkel modell uten månedsavgift</h2><p>Du betaler når Hundetimer faktisk gir deg et markedsplassalg.</p></div><div className="trainer-pricing-grid"><article className="trainer-price-card featured"><span className="price-badge">Markedsplass</span><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} %</strong><h3>av trenerens salgspris</h3><p>Gjelder privattimer, kurs, arrangementer og nettkurs som selges gjennom Hundetimer.</p><ul><li>Ingen oppstartsavgift</li><li>Ingen fast månedspris</li><li>Kunden betaler {CUSTOMER_SERVICE_FEE_NOK} kr servicegebyr i tillegg</li></ul></article><article className="trainer-price-card"><span className="price-badge neutral">Egne kunder</span><strong>0 %</strong><h3>markedsplassprovisjon</h3><p>Registrer avtaler du selv har fått via telefon, Facebook, eksisterende kunder eller andre kanaler.</p><ul><li>Blokkerer kalenderen</li><li>Kan knyttes til CRM og treningsjournal</li><li>Ingen markedsplassprovisjon</li></ul></article></div><div className="payout-explainer"><div><span className="eyebrow">Utbetaling</span><h3>To planlagte utbetalinger i måneden</h3></div><div className="payout-period"><strong>Fullført 1. til 15.</strong><span>Planlagt utbetaling 25.</span></div><div className="payout-period"><strong>Fullført 16. til månedsslutt</strong><span>Planlagt utbetaling 10. neste måned</span></div></div></section>

    <section className="trainer-sales-section trainer-how-section"><div className="trainer-sales-heading"><span className="eyebrow">Slik kommer du i gang</span><h2>Én konto, trenertilgang etter godkjenning</h2></div><ol className="trainer-onboarding-steps">{steps.map(([title,text],index)=><li key={title}><span>{index+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></section>

    <section className="trainer-agreement-callout"><div><span className="eyebrow">Ingen overraskelser</span><h2>Les avtalen før du søker</h2><p>Pris, utbetaling, ansvar, kundedata, nettkurs og avslutning står tydelig i treneravtalen. Avtalen godtas når søknaden sendes.</p></div><div className="trainer-agreement-actions"><Link className="btn secondary" href="/vilkar/treneravtale">Les treneravtalen</Link><a className="text-link" href="/trainer-agreement/current">Last ned PDF</a></div></section>

    <section className="trainer-sales-section" id="soknad">
      <div className="trainer-sales-heading"><span className="eyebrow">Bli hundetrener på Hundetimer</span><h2>Søknad om trenertilgang</h2><p>Du beholder den vanlige Hundetimer-kontoen din mens søknaden vurderes. Trenerdashboardet åpnes først etter godkjenning.</p></div>
      {params.message ? <p className="form-success form-error-block">{params.message}</p> : null}
      {params.error ? <p className="form-error form-error-block">{params.error}</p> : null}

      {!isSupabaseConfigured() ? <div className="notice">Koble til Supabase før trenersøknader kan sendes.</div>
      : !user ? <section className="dashboard-section"><h3>Logg inn med den vanlige kontoen din</h3><p className="muted">Har du ikke konto ennå, oppretter du en vanlig Hundetimer-konto. Det finnes ikke en separat trenerinnlogging.</p><div className="trainer-sales-actions"><Link className="btn" href="/login?next=/bli-trener">Logg inn</Link><Link className="btn secondary" href="/register?next=/bli-trener">Opprett konto</Link></div></section>
      : hasTrainerAccess ? <section className="dashboard-section verification-success-card"><span className="eyebrow">Trenertilgang</span><h3>{status === 'suspended' ? 'Trenerprofilen er midlertidig skjult' : 'Du er godkjent som hundetrener ✓'}</h3><p className="muted">Trenerområdet ligger nå på den samme kontoen som du bruker som kunde.</p><Link className="btn" href="/trainer-dashboard">Åpne trenerdashboard</Link></section>
      : status === 'pending' ? <section className="dashboard-section"><span className="eyebrow">Søknadsstatus</span><h3>Søknaden er til vurdering</h3><p className="muted">Vi har mottatt søknaden din{latest?.submitted_at ? ` ${new Intl.DateTimeFormat('nb-NO', { day:'numeric', month:'long', year:'numeric', timeZone:'Europe/Oslo' }).format(new Date(latest.submitted_at))}` : ''}. Du bruker Hundetimer som vanlig mens du venter.</p><div className="notice">Trenerdashboardet åpnes automatisk på kontoen din når søknaden blir godkjent.</div>{agreement ? <a className="text-link" href={`/trainer-agreement/${agreement.id}`}>Last ned din treneravtale →</a> : null}</section>
      : <form className="verification-form" action={submitTrainerApplicationAction}>
          {status === 'rejected' ? <section className="dashboard-section"><div className="verification-rejected"><strong>Søknaden trenger endringer.</strong><p>{trainer?.verification_review_note || latest?.admin_note || 'Se over opplysningene og send inn søknaden på nytt.'}</p></div></section> : null}
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">1. Trenerprofil</span><h3>Hvordan skal kundene bli kjent med deg?</h3></div></div><div className="form-grid"><label>Navn på trener eller virksomhet<input name="businessName" required defaultValue={trainer?.business_name || profile?.display_name || ''} /></label><label>Sted<input name="city" required defaultValue={trainer?.city || ''} placeholder="Hamar" /></label><label className="full">Kort om deg og treningen din<textarea name="bio" rows={5} required defaultValue={trainer?.bio || ''} placeholder="Fortell hvem du hjelper, hvordan du trener og hva kundene kan forvente." /></label><label className="full">Spesialiteter, separert med komma<input name="specialties" defaultValue={(trainer?.specialties || []).join(', ')} placeholder="Valp, passeringstrening, innkalling" /></label></div></section>
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">2. Søknad</span><h3>Opplysninger til Hundetimer</h3></div></div><p className="muted small">Disse opplysningene brukes når vi vurderer søknaden og publiseres ikke automatisk på trenerprofilen.</p><div className="form-grid"><label>Juridisk navn<input name="legalName" required defaultValue={trainer?.business_name || profile?.display_name || ''} /></label><label>Organisasjonsnummer<input name="organisationNumber" inputMode="numeric" maxLength={9} placeholder="9 siffer, hvis relevant" /></label><label>År med erfaring<input name="yearsExperience" type="number" min="0" max="80" placeholder="For eksempel 5" /></label><label className="full">Utdanning, kurs, erfaring og kvalifikasjoner<textarea name="qualifications" rows={5} placeholder="Fortell kort om relevant utdanning, kurs, sertifiseringer og praktisk erfaring." /></label><label className="full">Melding til Hundetimer<textarea name="note" rows={4} placeholder="Valgfritt" /></label></div></section>
          <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">3. Treneravtale</span><h3>Godta vilkårene og send søknaden</h3></div></div><label className="checkbox-row"><input type="checkbox" name="acceptAgreement" required /><span><strong>Jeg har lest og godtar treneravtale v{TRAINER_AGREEMENT_VERSION}</strong><small><Link className="text-link" href="/vilkar/treneravtale" target="_blank">Les treneravtalen</Link>. Aksepten registreres elektronisk sammen med søknaden.</small></span></label><div className="editor-actions"><button className="btn" type="submit">{status === 'rejected' ? 'Send søknaden på nytt' : 'Send søknad'}</button></div></section>
        </form>}
    </section>
  </main>;
}
