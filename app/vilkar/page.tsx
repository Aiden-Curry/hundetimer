import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, ShieldCheck, Mail, CircleHelp } from 'lucide-react';
import { CUSTOMER_SERVICE_FEE_NOK } from '@/lib/legal/trainer-agreement';
import './terms.css';

export const metadata: Metadata = {
  title: 'Brukervilkår',
  description: 'Vilkår for bruk av Hundetimer som kunde, besøkende eller kontohaver. Les om bestilling, betaling, avbestilling og dine rettigheter.',
};

export default function TermsPage() {
  const supportEmail = process.env.NEXT_PUBLIC_HUNDETIMER_SUPPORT_EMAIL?.trim();
  const sections = [
    { id: 'om-hundetimer', title: 'Om Hundetimer', content: <>
      <p>Hundetimer er en markedsplass som knytter hundeeiere sammen med selvstendige hundetrenere. Her kan du finne og bestille privattimer, aktiviteter, kurs og nettkurs.</p>
      <p>Disse vilkårene gjelder for bruk av nettsiden og kundekontoen din. Opplysninger om det enkelte tilbudet, treneren og vilkårene for kjøpet fremgår i tillegg av tilbudet og bestillingen. Hundetrenere har en egen avtale med Hundetimer.</p>
    </> },
    { id: 'konto', title: 'Konto og bruk av tjenesten', content: <>
      <p>Du kan se tilbud uten å være innlogget. For å bestille og følge opp kjøp trenger du en konto. Oppgi riktige opplysninger, og hold e-postadressen din oppdatert slik at du mottar beskjeder om bestillinger og betalinger.</p>
      <p>Ta vare på innloggingsopplysningene dine, og ikke del passord eller innloggingslenker med andre. Kontakt oss hvis du mistenker at noen har fått tilgang til kontoen. Du har ansvar for din egen bruk av tjenesten, men blir ikke automatisk ansvarlig for all uautorisert bruk av kontoen.</p>
    </> },
    { id: 'hundetrenere', title: 'Hundetrenere på plattformen', content: <>
      <p>Trenerne er selvstendige tilbydere og har ansvar for tjenestene de selger, kvalifikasjonene de oppgir, tilgjengeligheten og gjennomføringen av treningen. Hundetimer leverer plattformen for formidling, bestilling og oppfølging.</p>
      <p>Les trenerprofilen og beskrivelsen av tilbudet før du bestiller. Godkjenning av en trenerprofil er ikke en garanti for et bestemt treningsresultat. Gi treneren opplysninger om hunden som er relevante for en trygg gjennomføring.</p>
    </> },
    { id: 'bestillinger', title: 'Bestillinger', content: <>
      <p>For en privattime velger du trener, tjeneste og en ledig tid før du sender bestillingen. For aktiviteter og gruppekurs velger du tilbudet og melder deg på en tilgjengelig plass. En ventelisteplass er ikke en bekreftet påmelding.</p>
      <p>Nettkurs kjøpes fra kurssiden og åpnes fra Mine kurs når betalingen er fullført. Kontroller tid, sted, innhold, pris og eventuelle krav til deltakelse før du bestiller. Bestillingene dine finner du på Min side.</p>
    </> },
    { id: 'betaling', title: 'Betaling', content: <>
      <p>Betaling behandles gjennom Stripe, Hundetimers betalingsleverandør. Hundetimer lagrer ikke kortopplysningene dine, men lagrer opplysninger om kjøpet og betalingsstatusen.</p>
      <p>Ved bestilling av en privattime reserveres beløpet på kortet. Beløpet trekkes når treneren godkjenner timen, eller når du godtar et forslag til nytt tidspunkt. Gruppekurs, aktiviteter og nettkurs betales ved kjøp. Følg betalingsinformasjonen som vises for den aktuelle bestillingen.</p>
    </> },
    { id: 'godkjenning', title: 'Godkjenning av bestillinger', content: <>
      <p>Enkelte bestillinger, blant annet forespørsler om privattimer, krever godkjenning fra treneren. En sendt forespørsel eller en reservasjon på kortet betyr ikke at timen er bekreftet. Vent på bekreftelsen, og sjekk status på Min side.</p>
      <p>Hvis treneren avslår forespørselen eller svarfristen utløper, avbrytes bestillingen og kortreservasjonen frigjøres. Hvor raskt dette vises på kontoen din, avhenger av banken.</p>
    </> },
    { id: 'avbestilling', title: 'Avbestilling, endringer og refusjon', content: <>
      <p>Reglene kan variere med tjenesten, treneren og hvor nært oppstart du avbestiller. Les vilkårene som vises før kjøpet og på bestillingssiden. Vilkår for et kjøp kan ikke settes til side av strengere regler som først opplyses etterpå.</p>
      <h3>Hvis du vil avbestille eller flytte en time</h3>
      <p>Åpne bestillingen på Min side. Privattimer kan etter dagens løsning avbestilles der før start. Da frigjøres kortreservasjonen, eller hele betalingen sendes til refusjon hvis beløpet er trukket. Ønsker du en annen tid, kontakt treneren. Et forslag til nytt tidspunkt må godtas i bestillingen; en melding alene flytter ikke timen.</p>
      <h3>Når du venter på penger tilbake</h3>
      <p>Refusjoner sendes til betalingsmåten som ble brukt ved kjøpet. Status vises på bestillingen, men banken kan bruke tid på å vise tilbakebetalingen. For gruppekurs, aktiviteter og nettkurs må du se informasjonen for det aktuelle kjøpet. Kontakt oss hvis avbestillingsvalget mangler eller du mener refusjonen er feil.</p>
      <h3>Angrerett og mangler ved tjenesten</h3>
      <p>Avbestilling og lovbestemt angrerett er ikke det samme. Om du har angrerett, avhenger blant annet av hva du har kjøpt. Enkelte fritidsaktiviteter på en bestemt dato kan være unntatt. For digitalt innhold kan angreretten bare falle bort når lovens vilkår er oppfylt; tilgang til et nettkurs alene innebærer ikke at du har gitt avkall på rettighetene dine.</p>
      <p>Hvis treneren avlyser eller tjenesten ikke blir levert som avtalt, kontakt treneren eller Hundetimer. Disse vilkårene begrenser ikke rettigheter du har etter ufravikelig forbrukerlovgivning, blant annet ved mangler, avlysning eller krav om tilbakebetaling.</p>
    </> },
    { id: 'nettkurs', title: 'Nettkurs og digitalt innhold', content: <>
      <p>Tilgangen til et kjøpt nettkurs er knyttet til kontoen din og forutsetter fullført betaling. Eventuell tilgangsperiode og andre begrensninger skal fremgå av tilbudet før kjøpet. Ved refusjon eller reversert betaling kan tilgangen bli avsluttet i samsvar med kjøpsvilkårene og gjeldende regler.</p>
      <p>Kursinnholdet er til personlig bruk. Du kan ikke dele kontotilgangen, publisere materialet videre eller selge innholdet uten tillatelse fra rettighetshaveren. Dette begrenser ikke bruk som er tillatt etter ufravikelig lovgivning.</p>
    </> },
    { id: 'priser', title: 'Priser og gebyrer', content: <>
      <p>Trenerens pris fremgår av tilbudet. Hundetimer kan kreve et service- eller bestillingsgebyr i tillegg. Dagens servicegebyr er {CUSTOMER_SERVICE_FEE_NOK} kr for kjøp der gebyret gjelder. Totalprisen, inkludert gebyrer og eventuelle avgifter, vises før du bekrefter betalingen.</p>
      <p>Se gjennom totalsummen før du kjøper. Senere prisendringer endrer ikke prisen på en bestilling du allerede har inngått.</p>
    </> },
    { id: 'anmeldelser', title: 'Anmeldelser og innhold', content: <>
      <p>Anmeldelser skal bygge på egne erfaringer og være ærlige og relevante. Ikke publiser falske vurderinger, personangrep, trusler, ulovlig innhold eller personopplysninger om andre som ikke er nødvendige for vurderingen. Du må ha rett til å dele bilder og annet materiale du legger ut.</p>
      <p>Hundetimer kan undersøke og moderere villedende, krenkende, ulovlig eller annet upassende innhold. Saklig kritikk fjernes ikke bare fordi den er negativ. Kontakt oss hvis du vil melde fra om innhold eller få forklart en modereringsavgjørelse.</p>
    </> },
    { id: 'forbudt-bruk', title: 'Forbudt bruk', content: <>
      <p>Du skal ikke bruke Hundetimer til svindel, trakassering, identitetsmisbruk eller annen ulovlig aktivitet. Det er heller ikke tillatt å:</p>
      <ul><li>samle inn data systematisk ved scraping uten tillatelse</li><li>omgå betalingsløsningen eller manipulere bestillinger for å unngå gebyrer</li><li>forsøke å få uautorisert tilgang til kontoer, personopplysninger eller systemer</li><li>forstyrre driften, spre skadelig programvare eller misbruke sikkerhetsfunksjoner.</li></ul>
      <p>Oppdager du en sikkerhetsfeil, meld fra til oss uten å hente ut eller dele andres opplysninger.</p>
    </> },
    { id: 'avslutning', title: 'Suspensjon og avslutning av konto', content: <>
      <p>Hundetimer kan begrense, suspendere eller avslutte en konto ved misbruk, svindel, alvorlige sikkerhetsproblemer eller vesentlige eller gjentatte brudd på vilkårene. Tiltaket skal stå i forhold til forholdet det gjelder. Ved behov for å beskytte brukere, dyr eller tjenesten kan tilgangen begrenses straks.</p>
      <p>Vi gir informasjon om tiltaket og bakgrunnen så langt det er forsvarlig og tillatt. Du kan kontakte oss hvis du mener avgjørelsen er feil. En stengt konto fjerner ikke automatisk krav du har knyttet til kjøp eller refusjon.</p>
      <p>Du kan selv be om sletting under Personvern og konto. Der forklarer vi ventetid, aktive bestillinger og hva som skjer med tilgangen til kjøpte kurs.</p>
    </> },
    { id: 'ansvar', title: 'Ansvar', content: <>
      <p>Hundetimer har ansvar for plattformen og egne forpliktelser. Treneren har ansvar for treningen, undervisningen og tjenestene treneren leverer. Hvem du kan rette et krav mot, avhenger av hva kravet gjelder og reglene som gjelder for kjøpet.</p>
      <p>Treningsresultater vil blant annet avhenge av hunden, oppfølgingen og forutsetningene for treningen. Dette fritar ikke treneren fra å levere det som er avtalt, eller Hundetimer fra ansvar for egne feil. Vilkårene begrenser ikke ansvar eller forbrukerrettigheter som ikke lovlig kan begrenses.</p>
    </> },
    { id: 'endringer', title: 'Endringer i tjenesten', content: <>
      <p>Hundetimer kan oppdatere funksjoner, priser og vilkår når tjenesten utvikles eller regelverket endres. Vesentlige endringer varsles på en egnet måte, for eksempel på e-post eller i tjenesten, før de får virkning når det er påkrevd.</p>
      <p>Endringer gir ikke i seg selv adgang til å redusere rettighetene dine i et allerede inngått kjøp. Dersom en endring krever samtykke eller gir deg rett til å avslutte, skal dette håndteres etter gjeldende regler.</p>
    </> },
    { id: 'personvern', title: 'Personvern', content: <>
      <p>På <Link href="/personvern">personvernsiden</Link> forklarer vi hvilke opplysninger som er knyttet til bruken din av Hundetimer, hva de brukes til og hvordan du endrer valgene dine. Kontoinnstillingene gir tilgang til dataeksport, e-postvalg og forespørsel om sletting.</p>
    </> },
    { id: 'kontakt', title: 'Kontakt', content: <>
      <p>Har du spørsmål om vilkårene, en bestilling eller et problem med tjenesten, kan du kontakte oss via <Link href="/kontakt">kontaktsiden</Link>. Oppgi gjerne bestillingsnummer og en kort beskrivelse, slik at vi kan undersøke saken.</p>
      {supportEmail && <p>E-post: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>}
    </> },
    { id: 'lovvalg', title: 'Lovvalg', content: <>
      <p>Vilkårene er underlagt norsk rett. Lovvalget begrenser ikke vern du har etter ufravikelige forbrukerregler som gjelder for deg. Ved uenighet ber vi deg kontakte oss, slik at vi først kan forsøke å finne en løsning.</p>
    </> },
  ];

  return <main className="page-shell terms-page">
    <header className="terms-hero"><span className="eyebrow">Hundetimer</span><h1>Brukervilkår</h1><p>Her finner du vilkårene som gjelder når du bruker Hundetimer som kunde, besøkende eller kontohaver. De forklarer hvordan tjenesten fungerer, hva du kan forvente av oss, og hva vi forventer av deg.</p><p className="terms-updated">Sist oppdatert <time dateTime="2026-10-08">8. oktober 2026</time></p></header>
    <div className="terms-layout"><nav className="terms-nav" aria-label="Innhold i brukervilkårene"><h2>På denne siden</h2><ol>{sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol></nav><article className="terms-document" aria-label="Vilkår for bruk av Hundetimer">{sections.map((section, index) => <section className="terms-section" id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}><span className="terms-section-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h2 id={`${section.id}-title`}>{section.title}</h2>{section.content}</section>)}</article></div>
    <nav className="terms-related" aria-label="Mer informasjon"><Link href="/personvern"><ShieldCheck size={23} aria-hidden="true" /><h2>Personvern</h2><p>Les om opplysninger og valgene dine.</p><ArrowUpRight size={18} aria-hidden="true" /></Link><Link href="/kontakt"><Mail size={23} aria-hidden="true" /><h2>Kontakt</h2><p>Spør oss om en bestilling eller kontoen din.</p><ArrowUpRight size={18} aria-hidden="true" /></Link><Link href="/kontakt#faq-title"><CircleHelp size={23} aria-hidden="true" /><h2>Vanlige spørsmål</h2><p>Finn svar om betaling, bestilling og kurs.</p><ArrowUpRight size={18} aria-hidden="true" /></Link></nav>
  </main>;
}
