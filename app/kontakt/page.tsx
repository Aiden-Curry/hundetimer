import Link from 'next/link';
import { HeartHandshake, GraduationCap, Monitor, Plus, Mail } from 'lucide-react';
import { ContactForm } from '@/components/contact-form';
import { trainerAgreementOperator, MARKETPLACE_COMMISSION_PERCENT, CUSTOMER_SERVICE_FEE_NOK } from '@/lib/legal/trainer-agreement';
import './contact.css';

export const metadata = { title: 'Kontakt Hundetimer', description: 'Få hjelp med bestillinger, betalinger, kontoen din eller trenersøknaden. Finn svar på vanlige spørsmål og kontakt Hundetimer.' };

const faq = [
  ['Hvordan bestiller jeg en time hos en hundetrener?', <>Gå til <Link href="/discover">Finn hundetrening</Link>, velg en trener og åpne en privattime. Velg en ledig tid og fullfør betalingen for å sende forespørselen. Du kan følge bestillingen på Min side. Timen er bekreftet når treneren har godkjent den.</>],
  ['Når blir kortet mitt belastet?', <>For privattimer reserveres beløpet på kortet når du sender forespørselen. Pengene trekkes når treneren bekrefter timen, eller når du godtar et forslag til ny tid. Gruppekurs og nettkurs betales ved kjøp. Totalprisen, inkludert servicegebyret på {CUSTOMER_SERVICE_FEE_NOK} kr der det gjelder, vises før du betaler.</>],
  ['Hva skjer hvis treneren ikke godkjenner bookingen?', <>Hvis treneren avslår, eller svarfristen går ut, blir bestillingen avbrutt og kortreservasjonen frigjort. Det er banken din som avgjør hvor raskt reservasjonen forsvinner fra kontooversikten.</>],
  ['Hvordan avbestiller jeg en time?', <>Åpne bestillingen på <Link href="/account">Min side</Link> og velg avbestilling. Privattimer kan avbestilles der før timen starter. Les informasjonen som vises før du bekrefter. Finner du ikke valget, kan du kontakte oss med bestillingsnummeret.</>],
  ['Hvordan fungerer refusjon?', <>Ved avbestilling av en privattime før start frigjøres kortreservasjonen hvis pengene ikke er trukket. Er betalingen trukket, sendes en refusjon til samme betalingsmåte. Du kan følge status på bestillingen; det kan ta litt tid før banken viser pengene på kontoen. For andre kjøp, se informasjonen på bestillingen eller kontakt oss.</>],
  ['Kan jeg kjøpe nettkurs gjennom Hundetimer?', <>Ja. Du finner dem under <Link href="/online-courses">Nettkurs</Link>. Når betalingen er fullført, får du tilgang via Mine kurs på Min side. Der kan du åpne leksjoner og følge fremdriften din.</>],
  ['Hvordan blir jeg hundetrener på Hundetimer?', <>Fyll ut søknaden på <Link href="/bli-trener">Bli trener</Link> med den vanlige Hundetimer-kontoen din. Vi vurderer søknaden og sender treneravtalen hvis den går videre. Når begge har signert og søknaden er godkjent, setter du opp utbetaling hos Stripe. Trenerområdet åpnes når Stripe-kontoen er klar.</>],
  ['Hvor mye koster det å være trener på Hundetimer?', <>Det er ingen oppstartsavgift eller fast månedspris. Hundetimer tar {String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} % provisjon av salg gjennom markedsplassen. Avtaler du registrerer manuelt for egne kunder, og som ikke er solgt gjennom Hundetimer, har ingen markedsplassprovisjon. Se <Link href="/bli-trener#pris">priser og utbetaling</Link>.</>],
  ['Når får trenere utbetalt penger?', <>Fullførte salg fra den 1. til den 15. planlegges utbetalt den 25. samme måned. Salg fullført fra den 16. til månedsslutt planlegges utbetalt den 10. neste måned. Faller datoen på en dag som ikke er bankdag, kan utbetalingen skje neste bankdag. Refusjoner eller forhold som må avklares, kan påvirke utbetalingen.</>],
  ['Kan jeg endre eller flytte en booking?', <>Send treneren en melding fra bestillingen hvis du ønsker en annen tid. Hvis treneren sender et forslag til nytt tidspunkt, kan du godta eller avslå det på bestillingssiden. En melding alene endrer ikke tidspunktet, så sjekk at avtalen er oppdatert.</>],
  ['Hva gjør jeg hvis jeg ikke får logget inn?', <>Sjekk at du bruker e-postadressen du registrerte deg med. Hvis du venter på en e-post fra oss, se også i søppelposten og bruk den nyeste lenken du har fått. Får du fortsatt ikke tilgang, skriv til oss og beskriv hva som skjer. Vi trenger aldri passordet ditt.</>],
  ['Hvordan kontakter jeg Hundetimer?', <>Bruk skjemaet nedenfor, eller send en e-post til adressen nederst på siden. Fortell kort hva du trenger hjelp med, og ta gjerne med bestillingsnummer. Vi svarer normalt innen 1–2 virkedager.</>],
] as const;

export default function ContactPage() {
  const company = trainerAgreementOperator();
  return <main className="page-shell contact-page">
    <header className="contact-heading"><span className="eyebrow">Vi hjelper deg gjerne</span><h1>Kontakt Hundetimer</h1><p>Lurer du på noe om en bestilling, betaling eller kontoen din? Du kan også kontakte oss om trenersøknader og tekniske problemer. Fortell oss hva som har skjedd, så hjelper vi deg videre.</p></header>
    <section className="contact-cards" aria-label="Hva trenger du hjelp med?">
      <article><HeartHandshake size={23} aria-hidden="true" /><h2>For hundeeiere</h2><p>Spørsmål om en time, et kurs eller en betaling? Vi hjelper deg med bestillingen og kontoen din.</p></article>
      <article><GraduationCap size={23} aria-hidden="true" /><h2>For hundetrenere</h2><p>Ta kontakt om søknaden din, trenerprofilen, bestillinger eller utbetalinger.</p></article>
      <article><Monitor size={23} aria-hidden="true" /><h2>Teknisk hjelp</h2><p>Er det noe som ikke virker? Fortell hvilken side du var på, og hva du prøvde å gjøre.</p></article>
    </section>
    <section className="contact-faq" aria-labelledby="faq-title"><div className="contact-section-heading"><h2 id="faq-title">Vanlige spørsmål</h2><p>Kanskje du finner svaret her. Hvis ikke, er det bare å skrive til oss.</p></div><div className="contact-accordion">{faq.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18} aria-hidden="true" /></summary><div className="contact-answer"><p>{answer}</p></div></details>)}</div></section>
    <section className="contact-message-section" aria-labelledby="contact-form-title"><div className="contact-section-heading"><span className="eyebrow">Send oss en melding</span><h2 id="contact-form-title">Hva kan vi hjelpe deg med?</h2><p>Vi svarer normalt innen 1–2 virkedager.</p><p className="contact-help">Alle feltene i skjemaet må fylles ut.</p></div><ContactForm /></section>
    <section className="contact-company" aria-labelledby="company-title"><div><h2 id="company-title">{company.legalName}</h2>{company.organisationNumber && <p>Organisasjonsnummer: {company.organisationNumber}</p>}<a className="contact-email" href={`mailto:${company.supportEmail}`}><Mail size={18} aria-hidden="true" />{company.supportEmail}</a></div><div className="contact-legal"><Link href="/personvern">Personvern</Link><Link href="/vilkar">Brukervilkår</Link></div></section>
  </main>;
}
