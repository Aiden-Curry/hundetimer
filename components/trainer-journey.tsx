import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import type { getTrainerJourney } from '@/lib/trainer-journey-server';
import './trainer-journey.css';

const stages = ['application', 'review', 'sign', 'countersign', 'approval', 'stripe', 'ready'] as const;
const titles = ['Send søknaden', 'Hundetimer vurderer søknaden', 'Les og signer avtalen', 'Hundetimer signerer', 'Endelig godkjenning', 'Sett opp utbetaling hos Stripe', 'Trenerdashboardet åpnes'];
const copy = {
  application: ['Søk om å bli hundetrener', 'Bruk den vanlige Hundetimer-kontoen din. Fortell om erfaringen din og hva du vil tilby.'],
  review: ['Vi har mottatt søknaden din', 'Vi går gjennom det du har sendt inn. Du trenger ikke gjøre noe mens du venter. Går søknaden videre, får du treneravtalen her på kontoen din.'],
  sign: ['Treneravtalen er klar', 'Les avtalen og signer med fullt navn. Deretter sendes den videre til Hundetimer for signering.'],
  countersign: ['Nå er det vår tur til å signere', 'Du har signert treneravtalen. Vi signerer også før søknaden går videre til endelig godkjenning.'],
  approval: ['Avtalen er signert av begge parter', 'Søknaden venter på endelig godkjenning. Etter godkjenning setter du opp utbetaling hos Stripe.'],
  stripe: ['Søknaden din er godkjent', 'Nå gjenstår det å sette opp utbetalingene. Følg lenken til Stripe og fyll inn opplysningene de ber om. Trenerområdet åpnes når Stripe bekrefter at kontoen kan ta imot overføringer og utbetalinger.'],
  ready: ['Du kan ta i bruk trenerområdet', 'Avtalen er signert, søknaden er godkjent og Stripe-kontoen er klar. Nå kan du redigere profilen din, legge inn treningstilbud og følge opp bestillinger.'],
  rejected: ['Søknaden trenger endringer', 'Les tilbakemeldingen, oppdater opplysningene og send søknaden på nytt.'],
  suspended: ['Trenerprofilen er midlertidig skjult', 'Trenertilgangen er satt på pause. Du kan fortsatt lese avtalen og bruke den vanlige kontoen din.'],
};

export function TrainerJourney({ journey, compact = false }: { journey: NonNullable<Awaited<ReturnType<typeof getTrainerJourney>>>; compact?: boolean }) {
  const { stage, agreement, submission, trainer, payment } = journey;
  if (journey.error) return <section className="trainer-journey"><h2>Kunne ikke hente søknadsstatus</h2><p>Prøv å laste siden på nytt om litt.</p><Link className="btn secondary" href="/trainer-dashboard/verification">Prøv igjen</Link></section>;
  const current = stages.indexOf(stage as typeof stages[number]);
  const [title, description] = copy[stage];
  return <section className="trainer-journey" aria-labelledby="journey-title">
    <div className="journey-current"><span>Søknadsstatus</span><h2 id="journey-title">{title}</h2><p>{description}</p>
      {submission?.submitted_at && <small>Søknad sendt {new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(submission.submitted_at))}</small>}
      {(stage === 'rejected' || stage === 'suspended') && (trainer?.verification_review_note || submission?.admin_note) && <p className="journey-feedback">{trainer?.verification_review_note || submission?.admin_note}</p>}
      <div className="journey-actions">
        {(stage === 'application' || stage === 'rejected') && <Link className="btn" href="/bli-trener#soknad">{stage === 'rejected' ? 'Oppdater søknaden' : 'Til søknaden'}<ArrowRight size={16} aria-hidden="true" /></Link>}
        {stage === 'sign' && <Link className="btn" href="/vilkar/treneravtale">Les og signer treneravtalen</Link>}
        {stage === 'stripe' && <><a className="btn" href="/api/stripe/connect/onboard">{payment?.stripe_account_id ? 'Fortsett hos Stripe' : 'Sett opp utbetaling hos Stripe'}</a>{payment?.stripe_account_id && <a className="btn secondary" href="/api/stripe/connect/return">Oppdater Stripe-status</a>}</>}
        {stage === 'ready' && <Link className="btn" href="/trainer-dashboard">Åpne trenerområdet<ArrowRight size={16} aria-hidden="true" /></Link>}
        {agreement?.trainer_signed_at && <a className="journey-document" href={`/trainer-agreement/${agreement.id}`}>{agreement.admin_signed_at ? 'Last ned signert avtale' : 'Last ned avtalen med din signatur'}</a>}
      </div>
      {stage === 'stripe' && payment?.details_submitted && <p className="journey-feedback">Opplysningene er sendt til Stripe. Det kan gjenstå kontroll eller flere opplysninger før utbetalinger blir aktivert.</p>}
    </div>
    {compact && <Link className="journey-document" href="/trainer-dashboard/verification">Se hele søknadsforløpet</Link>}
    {!compact && stage !== 'suspended' && <ol className="journey-steps" aria-label="Steg til trenertilgang">{stages.map((step, index) => <li key={step} className={index < current ? 'done' : index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}><span aria-hidden="true">{index < current ? <Check size={14} /> : index + 1}</span><div>{titles[index]}{step === 'sign' && <small>Avtalen blir tilgjengelig når Hundetimer sender den.</small>}</div></li>)}</ol>}
  </section>;
}
