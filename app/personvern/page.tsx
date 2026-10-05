import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import './privacy.css';
import { CookieSettingsButton } from '@/components/cookie-consent';

export const metadata = {
  title: 'Personvern og informasjonskapsler',
  description: 'Informasjon om personvern og bruk av informasjonskapsler på Hundetimer.',
};

export default function PrivacyInfoPage() {
  return (
    <main className="page-shell privacy-page">
      <Link className="privacy-back" href="/"><ArrowLeft size={16} aria-hidden="true" />Til forsiden</Link>
      <header className="privacy-heading">
        <h1>Personvern og informasjonskapsler</h1>
        <p className="muted">Her forklarer vi hvordan Hundetimer bruker informasjonskapsler og hvordan du kan styre valgene dine.</p>
      </header>

      <div className="privacy-layout">
        <nav className="privacy-nav" aria-label="På denne siden">
          <span>På denne siden</span>
          <a href="#nodvendige">Nødvendige informasjonskapsler</a>
          <a href="#analyse">Analyse og markedsføring</a>
          <a href="#samtykke">Endre samtykke</a>
          <a href="#konto">Konto og personopplysninger</a>
        </nav>
        <div className="privacy-document">

      <section className="privacy-section" id="nodvendige" aria-labelledby="nodvendige-heading">
        <h2 id="nodvendige-heading">Nødvendige informasjonskapsler</h2>
        <p>Hundetimer bruker nødvendige informasjonskapsler for funksjoner som innlogging, sikkerhet, sesjonshåndtering og integrasjoner du selv starter. Disse er nødvendige for at tjenesten skal fungere og kan derfor ikke slås av gjennom samtykkebanneret.</p>
      </section>

      <section className="privacy-section" id="analyse" aria-labelledby="analyse-heading">
        <h2 id="analyse-heading">Analyse og markedsføring</h2>
        <p>Hundetimer har foreløpig ikke aktivert Google Analytics, Meta Pixel eller tilsvarende ikke-nødvendige sporingsverktøy. Dersom analyse eller markedsføringssporing aktiveres senere, skal slike verktøy bare lastes etter at du har gitt samtykke til den aktuelle kategorien.</p>
      </section>

      <section className="privacy-section" id="samtykke" aria-labelledby="samtykke-heading">
        <h2 id="samtykke-heading">Endre eller trekke tilbake samtykke</h2>
        <p>Du kan når som helst åpne cookieinnstillingene og endre valget ditt. Det skal være like enkelt å trekke tilbake samtykke som å gi det.</p>
        <div className="privacy-cookie-action"><CookieSettingsButton /></div>
      </section>

      <section className="privacy-section" id="konto" aria-labelledby="konto-heading">
        <h2 id="konto-heading">Konto og andre personopplysninger</h2>
        <p>Har du en Hundetimer-konto, kan du administrere markedsføringsvalg, laste ned kontodata og be om sletting fra siden for personvern og konto.</p>
        <Link className="btn secondary" href="/account/privacy">Personvern og konto<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section>
        </div>
      </div>
    </main>
  );
}
