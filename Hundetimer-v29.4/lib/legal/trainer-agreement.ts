export const TRAINER_AGREEMENT_VERSION = '1.0';
export const TRAINER_AGREEMENT_EFFECTIVE_ISO = '2026-10-01';
export const TRAINER_AGREEMENT_EFFECTIVE_LABEL = '1. oktober 2026';
export const MARKETPLACE_COMMISSION_PERCENT = 7.5;
export const CUSTOMER_SERVICE_FEE_NOK = 29;

export function trainerAgreementOperator() {
  const legalName = process.env.NEXT_PUBLIC_HUNDETIMER_LEGAL_NAME?.trim() || 'Hundetimer';
  const organisationNumber = process.env.NEXT_PUBLIC_HUNDETIMER_ORG_NUMBER?.trim() || '';
  const supportEmail = process.env.NEXT_PUBLIC_HUNDETIMER_SUPPORT_EMAIL?.trim() || 'hei@hundetimer.no';
  return { legalName, organisationNumber, supportEmail };
}

export type AgreementSection = { title: string; paragraphs: string[] };

export function trainerAgreementSections(): AgreementSection[] {
  const operator = trainerAgreementOperator();
  const operatorText = operator.organisationNumber
    ? `${operator.legalName}, org.nr. ${operator.organisationNumber}`
    : operator.legalName;

  return [
    {
      title: '1. Parter og avtalen',
      paragraphs: [
        `Denne treneravtalen inngås mellom ${operatorText} ("Hundetimer") og virksomheten eller personen som registrerer og driver trenerprofilen ("Treneren").`,
        'Avtalen regulerer Trenerens bruk av Hundetimer som markedsplass, bookingverktøy, kursplattform, kundeverktøy og betalingsrelatert plattform. Treneren må også følge øvrige vilkår og retningslinjer som gjelder for funksjonene som brukes.',
      ],
    },
    {
      title: '2. Hundetimers rolle',
      paragraphs: [
        'Hundetimer tilbyr en digital plattform som gjør det mulig for kunder å finne, bestille og følge opp hundetrening, kurs, arrangementer og nettkurs.',
        'Treneren er selv leverandør av den hundetreningen, undervisningen eller annet faglig innhold som Treneren tilbyr. Hundetimer er ikke arbeidsgiver for Treneren og inngår ikke et ansettelses-, agentur- eller partnerskapsforhold med Treneren.',
        'Hundetimer kan legge til rette for betaling, kommunikasjon, kalender, kundehistorikk og utbetaling gjennom plattformen og eventuelle tredjepartsleverandører.',
      ],
    },
    {
      title: '3. Krav til treneren og verifisering',
      paragraphs: [
        'Treneren skal gi korrekte og oppdaterte opplysninger om identitet, virksomhet, erfaring, kvalifikasjoner, priser og tjenester.',
        'Hundetimer kan kreve dokumentasjon før en profil godkjennes eller senere dersom det er nødvendig for sikkerhet, kvalitet eller kontroll. Godkjenning er ikke en garanti fra Hundetimer for et bestemt faglig nivå eller resultat.',
        'Treneren er ansvarlig for nødvendige registreringer, tillatelser, forsikringer og andre krav som gjelder for egen virksomhet og aktivitet.',
      ],
    },
    {
      title: '4. Profil, tjenester og tilgjengelighet',
      paragraphs: [
        'Treneren er ansvarlig for at priser, beskrivelser, kapasitet, tilgjengelighet, lokasjon og annet publisert innhold er riktig.',
        'Treneren skal holde kalender og kapasitet oppdatert og skal ikke bevisst tilby tider eller plasser som ikke kan leveres.',
        'Hundetimer kan skjule eller korrigere åpenbart feilaktig eller villedende informasjon og kan be Treneren om å oppdatere profilen.',
      ],
    },
    {
      title: '5. Pris og gebyrer',
      paragraphs: [
        `Det er ingen månedlig abonnementsavgift i denne avtaleversjonen. For salg som kommer gjennom Hundetimers markedsplass, beholder Hundetimer ${String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} % av salgsbeløpet som plattformprovisjon.`,
        `Kunden betaler i tillegg et servicegebyr på ${CUSTOMER_SERVICE_FEE_NOK} kr per bestilling eller kjøp der dette vises i utsjekken. Servicegebyret tilfaller Hundetimer og trekkes ikke fra Trenerens oppgitte pris.`,
        'Avtaler og kunder som Treneren selv registrerer manuelt i Hundetimers kalender eller CRM, og som ikke er solgt gjennom markedsplassen, utløser ikke markedsplassprovisjon. Eventuelle betalingskostnader eller andre særskilte tjenester må fremgå tydelig dersom de innføres senere.',
        'Hundetimer kan endre priser og gebyrer med rimelig forhåndsvarsel. Vesentlige endringer skal varsles før de trer i kraft, og Treneren kan avslutte avtalen dersom endringen ikke aksepteres.',
      ],
    },
    {
      title: '6. Betaling og utbetaling',
      paragraphs: [
        'Betaling fra kunder kan behandles av Hundetimer og/eller en ekstern betalingsleverandør. Treneren skal ikke forsøke å omgå en gjennomført markedsplassbestilling for å unngå plattformprovisjon.',
        'Opptjening fra fullførte markedsplassalg legges til Trenerens utbetalingssaldo etter fradrag for avtalt plattformprovisjon, refusjoner, chargebacks, korreksjoner og andre beløp som etter avtalen skal belastes Treneren.',
        'Planlagt utbetaling skjer den 10. og 25. i måneden. Fullførte salg fra 1. til 15. planlegges til utbetaling den 25. samme måned. Fullførte salg fra 16. til månedsslutt planlegges til utbetaling den 10. i neste måned. Dersom utbetalingsdagen ikke er en bankdag, kan utbetalingen skje neste bankdag.',
        'Treneren er ansvarlig for å holde bank- og virksomhetsopplysninger korrekte. Hundetimer kan holde tilbake en utbetaling ved pågående refusjon, tvist, mistanke om misbruk, feil i opplysninger eller andre forhold som må avklares før betaling.',
      ],
    },
    {
      title: '7. Avbestilling, refusjon og betalingsinnsigelser',
      paragraphs: [
        'Avbestilling og refusjon håndteres etter reglene som vises kunden ved bestilling og de funksjonene som gjelder for den aktuelle tjenesten.',
        'Dersom en kunde får tilbakebetalt hele eller deler av et kjøp, eller en betaling reverseres, kan det tilhørende beløpet trekkes fra Trenerens nåværende eller fremtidige utbetalingssaldo når beløpet ellers ville tilfalt Treneren.',
        'Treneren skal samarbeide med Hundetimer ved betalingsinnsigelser og gi nødvendig dokumentasjon om at en tjeneste er levert eller hva som har skjedd i saken.',
      ],
    },
    {
      title: '8. Levering, sikkerhet og dyrevelferd',
      paragraphs: [
        'Treneren er ansvarlig for planlegging og gjennomføring av egne tjenester, faglige råd og sikkerheten i egen aktivitet.',
        'Treneren skal behandle hunder og mennesker forsvarlig og følge gjeldende regler om dyrevelferd, sikkerhet og annen relevant lovgivning.',
        'Hundetimer kan midlertidig skjule eller suspendere en profil ved alvorlige sikkerhetsbekymringer, mistanke om mishandling, svindel, trakassering, gjentatte alvorlige kundeklager eller andre vesentlige brudd på avtalen.',
      ],
    },
    {
      title: '9. Kunder og kommunikasjon',
      paragraphs: [
        'Treneren skal opptre profesjonelt overfor kunder og svare på bestillingsforespørsler innen fristene som vises i plattformen.',
        'Kundeopplysninger som Treneren får gjennom Hundetimer skal bare brukes til å levere og følge opp de aktuelle tjenestene, med mindre kunden har gitt et separat gyldig samtykke til for eksempel markedsføring.',
        'Treneren må ikke selge, dele eller bruke kundedata til uvedkommende formål.',
      ],
    },
    {
      title: '10. Personvern og kundeverktøy',
      paragraphs: [
        'Hundetimer behandler personopplysninger som plattformoperatør etter nettstedets personverninformasjon. Når Treneren registrerer egne eksterne kunder i CRM- eller kalenderfunksjoner, er Treneren ansvarlig for at opplysningene registreres og brukes på et lovlig grunnlag.',
        'Private trenernotater skal brukes saklig og bare inneholde informasjon som er relevant for oppfølgingen av kunden og hunden. Delte notater skal være egnet til å vises kunden.',
      ],
    },
    {
      title: '11. Vurderinger, moderering og omdømme',
      paragraphs: [
        'Kunder kan legge igjen vurderinger etter kvalifiserte kjøp. Treneren kan svare på vurderinger gjennom funksjonene Hundetimer tilbyr.',
        'Hundetimer kan moderere innhold som bryter med regler, er ulovlig, inneholder personangrep, avslører unødvendige personopplysninger eller på annen måte ikke hører hjemme på plattformen. Hundetimer skal ikke fjerne saklig kritikk bare fordi den er negativ.',
      ],
    },
    {
      title: '12. Innhold og nettkurs',
      paragraphs: [
        'Treneren beholder eierskapet til eget originalt kursmateriell, bilder, videoer og annet innhold, med mindre annet er avtalt.',
        'Når innhold publiseres på Hundetimer, gir Treneren Hundetimer en ikke-eksklusiv rett til å lagre, vise, distribuere og markedsføre innholdet i den grad det er nødvendig for å levere og markedsføre tjenesten.',
        'For innhold som er kjøpt av kunder, kan nødvendig tilgang fortsette etter at Treneren avslutter avtalen dersom dette er nødvendig for å oppfylle allerede gjennomførte kjøp.',
        'Treneren er ansvarlig for å ha rettigheter til materiale som lastes opp og skal ikke publisere innhold som krenker andres opphavsrett, varemerker eller andre rettigheter.',
      ],
    },
    {
      title: '13. Skatt, merverdiavgift og regnskap',
      paragraphs: [
        'Treneren er selv ansvarlig for skatt, merverdiavgift, bokføring, rapportering og øvrige økonomiske plikter knyttet til egen virksomhet og inntekt.',
        'Utbetalingsoversikter fra Hundetimer er dokumentasjon på plattformens beregninger og erstatter ikke Trenerens ansvar for korrekt regnskapsføring eller annen dokumentasjon som kreves etter gjeldende regler.',
      ],
    },
    {
      title: '14. Drift og tredjepartstjenester',
      paragraphs: [
        'Hundetimer arbeider for stabil tilgjengelighet, men kan ikke garantere at plattformen alltid er uten avbrudd eller feil. Vedlikehold, sikkerhetstiltak og feil hos underleverandører kan påvirke tilgjengeligheten.',
        'Enkelte funksjoner kan avhenge av tredjepartsleverandører for blant annet betaling, e-post, kalender, hosting og datalagring.',
      ],
    },
    {
      title: '15. Suspensjon og avslutning',
      paragraphs: [
        'Treneren kan be om å avslutte samarbeidet. Før kontoen kan slettes eller stenges helt, må aktive bestillinger, kundetilganger, refusjoner og utestående utbetalinger håndteres.',
        'Hundetimer kan suspendere eller avslutte tilgangen ved vesentlig eller gjentatt avtalebrudd, svindel, alvorlige sikkerhetsproblemer, manglende lovpålagte opplysninger eller annen bruk som kan skade kunder, dyr, Hundetimer eller andre brukere.',
        'Avslutning fritar ikke partene fra plikter som allerede har oppstått, som gjennomføring eller avvikling av eksisterende bestillinger, refusjoner, utbetalinger, kundetilgang til kjøpt innhold og nødvendige dokumentasjonsplikter.',
      ],
    },
    {
      title: '16. Ansvar',
      paragraphs: [
        'Hver part er ansvarlig for egne handlinger, egne forpliktelser og tap som etter alminnelige regler kan tilskrives parten.',
        'Hundetimer er ikke ansvarlig for selve den faglige hundetreningen eller resultatet av Trenerens tjenester. Ingenting i avtalen begrenser ansvar som ikke lovlig kan begrenses.',
      ],
    },
    {
      title: '17. Endringer i avtalen',
      paragraphs: [
        'Hundetimer kan oppdatere avtalen når plattformen, forretningsmodellen eller regelverket endres. Vesentlige endringer varsles før de får virkning for Treneren.',
        'Dersom en ny avtale krever ny aksept, vil Treneren bli bedt om å godta den nye versjonen før enkelte funksjoner kan brukes videre.',
      ],
    },
    {
      title: '18. Lovvalg og tvister',
      paragraphs: [
        'Avtalen reguleres av norsk rett.',
        `Partene skal først forsøke å løse uenigheter i dialog. Treneren kan kontakte Hundetimer på ${operator.supportEmail}. Dersom saken ikke løses, kan den bringes inn for ordinære norske domstoler etter gjeldende regler.`,
      ],
    },
  ];
}

export function trainerAgreementPlainText() {
  const operator = trainerAgreementOperator();
  const header = [
    'HUNDETIMER - TRENERAVTALE',
    `Versjon ${TRAINER_AGREEMENT_VERSION}`,
    `Gjelder fra ${TRAINER_AGREEMENT_EFFECTIVE_LABEL}`,
    `Plattformoperatør: ${operator.legalName}${operator.organisationNumber ? `, org.nr. ${operator.organisationNumber}` : ''}`,
    '',
  ];
  return [...header, ...trainerAgreementSections().flatMap((section) => [section.title, ...section.paragraphs, ''])].join('\n');
}
