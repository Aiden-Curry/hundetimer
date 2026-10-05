import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarDays, CircleDollarSign, GraduationCap, HeartHandshake, LayoutDashboard, Megaphone, ShieldCheck, Users } from 'lucide-react';
import { CUSTOMER_SERVICE_FEE_NOK, MARKETPLACE_COMMISSION_PERCENT } from '@/lib/legal/trainer-agreement';

const features = [
  { icon: CalendarDays, title: 'Booking og kalender', text: 'Samle markedsplassbestillinger, direktekunder og egne avtaler i samme kalender.' },
  { icon: Users, title: 'Kunder og hunder', text: 'Ha kundehistorikk, hunder, treningsjournal og oppfølging samlet på ett sted.' },
  { icon: GraduationCap, title: 'Privattimer, kurs og nettkurs', text: 'Selg både individuelle timer, gruppeaktiviteter og digitale kurs fra samme profil.' },
  { icon: CircleDollarSign, title: 'Betaling og utbetaling', text: 'Hundetimer holder oversikt over markedsplassalg, provisjon og planlagte utbetalinger.' },
  { icon: Megaphone, title: 'Bli funnet av nye kunder', text: 'En offentlig trenerprofil gjør tjenestene dine søkbare for hundeeiere som leter etter hjelp.' },
  { icon: LayoutDashboard, title: 'Et sted å drive virksomheten', text: 'Dashboard, meldinger, rabatter, nyhetsbrev, vurderinger og økonomi uten separate systemer.' },
];

const steps = [
  ['Opprett trenerprofil', 'Fortell hvem du er, hvor du holder til og hva du tilbyr.'],
  ['Les og godta treneravtalen', 'Du ser pris, utbetalingsmodell og vilkår før du sender inn søknaden.'],
  ['Send inn verifisering', 'Vi vurderer virksomhetsopplysninger og dokumentasjon før profilen blir offentlig.'],
  ['Publiser og ta imot bestillinger', 'Når profilen er godkjent kan kunder finne, bestille og betale gjennom Hundetimer.'],
];

export default function BecomeTrainerPage() {
  return <main className="become-trainer-page">
    <section className="trainer-sales-hero">
      <div className="trainer-sales-copy">
        <span className="eyebrow">For hundetrenere</span>
        <h1>Mer tid til hundene.<br /><em>Mindre administrasjon.</em></h1>
        <p>Hundetimer samler booking, kunder, kalender, kurs, nettkurs og oppfølging, samtidig som nye kunder kan finne deg.</p>
        <div className="trainer-sales-actions"><Link className="btn" href="/register?role=trainer">Opprett trenerkonto <ArrowRight size={18} /></Link><Link className="btn secondary" href="#pris">Se pris og utbetaling</Link></div>
        <div className="trainer-sales-trust"><span><BadgeCheck size={18} /> Verifiserte profiler</span><span><ShieldCheck size={18} /> Tydelige vilkår</span><span><HeartHandshake size={18} /> Ingen månedsavgift</span></div>
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

    <section className="trainer-sales-section trainer-how-section"><div className="trainer-sales-heading"><span className="eyebrow">Slik kommer du i gang</span><h2>Fra konto til offentlig trenerprofil</h2></div><ol className="trainer-onboarding-steps">{steps.map(([title,text],index)=><li key={title}><span>{index+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></section>

    <section className="trainer-agreement-callout"><div><span className="eyebrow">Ingen overraskelser</span><h2>Les avtalen før du bestemmer deg</h2><p>Pris, utbetaling, ansvar, kundedata, nettkurs og avslutning står tydelig i treneravtalen. Du godtar avtalen elektronisk før trenerverifisering kan sendes inn.</p></div><div className="trainer-agreement-actions"><Link className="btn secondary" href="/vilkar/treneravtale">Les treneravtalen</Link><a className="text-link" href="/trainer-agreement/current">Last ned PDF</a></div></section>

    <section className="trainer-final-cta"><span className="eyebrow">Klar?</span><h2>Bygg trenerprofilen din på Hundetimer</h2><p>Det koster ingenting å opprette kontoen og gjøre profilen klar.</p><Link className="btn btn-light" href="/register?role=trainer">Bli trener på Hundetimer <ArrowRight size={18} /></Link></section>
  </main>;
}
