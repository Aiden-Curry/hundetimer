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
        <p className="muted">Når du bestiller trening, sender en melding eller melder deg på nyhetsbrevet, deler du opplysninger med Hundetimer. Her kan du lese hva de brukes til, og hvor du finner innstillingene dine.</p>
      </header>

      <div className="privacy-layout">
        <nav className="privacy-nav" aria-label="På denne siden">
          <span>På denne siden</span>
          <a href="#opplysninger">Opplysninger du deler med oss</a>
          <a href="#nyhetsbrev">Nyhetsbrev og e-post</a>
          <a href="#nodvendige">Nødvendige informasjonskapsler</a>
          <a href="#analyse">Analyse og markedsføring</a>
          <a href="#samtykke">Endre samtykke</a>
          <a href="#konto">Konto og personopplysninger</a>
        </nav>
        <div className="privacy-document">

      <section className="privacy-section" id="opplysninger" aria-labelledby="opplysninger-heading">
        <h2 id="opplysninger-heading">Opplysninger du deler med oss</h2>
        <p>Når du oppretter en konto, lagrer vi blant annet navn og e-postadresse. Bruker du Hundetimer til å bestille trening, lagrer vi også opplysninger om bestillingen. Det gjør at du kan finne igjen avtaler, følge status og holde kontakten med treneren.</p>
        <p>Hva som ellers er knyttet til kontoen din, avhenger av hvordan du bruker tjenesten. Det kan være hundeprofiler du har lagt til, meldinger du har sendt, vurderinger, lagrede favoritter og fremdrift i nettkurs. Opplysninger du sender til en trener i forbindelse med en bestilling, brukes i oppfølgingen av deg og hunden din.</p>
        <p>Betalinger behandles av Stripe. Kontodataene hos Hundetimer inneholder opplysninger om kjøp og betalingsstatus, men selve kortopplysningene er ikke med i dataeksporten fra Hundetimer.</p>
      </section>

      <section className="privacy-section" id="nyhetsbrev" aria-labelledby="nyhetsbrev-heading">
        <h2 id="nyhetsbrev-heading">Nyhetsbrev og e-post</h2>
        <p>Melder du deg på nyhetsbrevet, lagrer vi navnet og e-postadressen du oppgir, sammen med tidspunktet for påmeldingen og samtykket ditt. Vi bruker e-postadressen til å sende deg nyheter om kurs, trenere og tilbud fra Hundetimer.</p>
        <p>Du kan melde deg av via lenken i nyhetsbrevet. Har du en konto med samme e-postadresse, kan du også slå av nyhetsbrevet under «Personvern og konto». Et eventuelt nyhetsbrev fra en trener har en egen påmelding og avmelding.</p>
        <p>E-poster om en bestilling, betaling eller sikkerheten til kontoen din er noe annet enn nyhetsbrev. Slike beskjeder kan du fortsatt få selv om du har takket nei til markedsføring.</p>
      </section>

      <section className="privacy-section" id="nodvendige" aria-labelledby="nodvendige-heading">
        <h2 id="nodvendige-heading">Nødvendige informasjonskapsler</h2>
        <p>Informasjonskapsler, ofte kalt cookies, er små opplysninger som lagres i nettleseren din. Hundetimer bruker dem blant annet til å holde deg innlogget og huske valgene du gjør i innstillingene for informasjonskapsler.</p>
        <p>Noen informasjonskapsler er nødvendige for innlogging, sikkerhet og funksjoner du ber om å bruke. De kan derfor ikke slås av i samtykkebanneret. Du kan blokkere dem i nettleseren, men da kan enkelte deler av Hundetimer slutte å fungere.</p>
      </section>

      <section className="privacy-section" id="analyse" aria-labelledby="analyse-heading">
        <h2 id="analyse-heading">Analyse og markedsføring</h2>
        <p>Vi har ikke aktivert Google Analytics, Meta Pixel eller tilsvarende sporingsverktøy på Hundetimer nå. Du kan likevel se valg for analyse og markedsføring i innstillingene for informasjonskapsler.</p>
        <p>Valgene gjelder eventuell bruk av slike verktøy senere. Analyse handler om å forstå hvordan nettsiden brukes, mens markedsføringssporing kan brukes til annonsering. Slike verktøy skal bare lastes når du har samtykket til den aktuelle kategorien.</p>
        <p>Valget for markedsføring i disse innstillingene melder deg ikke på nyhetsbrevet. Påmelding til e-post gjøres separat.</p>
      </section>

      <section className="privacy-section" id="samtykke" aria-labelledby="samtykke-heading">
        <h2 id="samtykke-heading">Endre eller trekke tilbake samtykke</h2>
        <p>Du kan åpne innstillingene med knappen nedenfor, eller via «Informasjonskapsler» nederst på nettsiden. Velg kategoriene du ønsker, og trykk «Lagre valg». Velger du «Kun nødvendige», slås de frivillige kategoriene av.</p>
        <p>Valget lagres i nettleseren i opptil seks måneder. Bytter du nettleser eller enhet, eller sletter informasjonskapslene, kan du bli spurt på nytt. Disse innstillingene gjelder nettleseren du bruker, og endrer ikke e-postvalgene på kontoen din.</p>
        <div className="privacy-cookie-action"><CookieSettingsButton /></div>
      </section>

      <section className="privacy-section" id="konto" aria-labelledby="konto-heading">
        <h2 id="konto-heading">Konto og andre personopplysninger</h2>
        <p>På «Personvern og konto» finner du e-postvalgene dine og kan laste ned en kopi av opplysningene som er knyttet til kontoen. Nedlastingen er en JSON-fil, et tekstformat som samler dataene på ett sted. Den inneholder filreferanser, men ikke selve vedleggene.</p>
        <p>Du kan også be om å slette kontoen der. Før du gjør det, får du informasjon om ventetiden og hva du mister tilgang til. Aktive bestillinger og pågående refusjoner må håndteres først. Trenerkontoer gjennomgås av en administrator fordi slettingen også kan påvirke kunder, kurs og utbetalinger.</p>
        <p>Kontosletting betyr ikke at alle opplysninger om tidligere betalinger og andre hendelser fjernes. Noen transaksjons- og saksopplysninger beholdes i anonymisert eller begrenset form. Du finner mer informasjon ved slettevalget på kontosiden.</p>
        <Link className="btn secondary" href="/account/privacy">Personvern og konto<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section>
        </div>
      </div>
    </main>
  );
}
