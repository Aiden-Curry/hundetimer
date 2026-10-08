export const TRAINER_AGREEMENT_VERSION = '1.0';
export const TRAINER_AGREEMENT_EFFECTIVE_ISO = '2026-10-01';
export const TRAINER_AGREEMENT_EFFECTIVE_LABEL = '1. oktober 2026';
// Editorial revision only; existing signed snapshots and access requirements remain unchanged.
export const TRAINER_AGREEMENT_REVISION_LABEL = '8. oktober 2026';
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
      title: '1. Avtalens parter og virkeområde',
      paragraphs: [
        `Denne treneravtalen inngås mellom ${operatorText} ("Hundetimer") og virksomheten eller personen som registrerer og driver trenerprofilen ("Treneren").`,
        'Avtalen regulerer Trenerens bruk av Hundetimers markedsplass og tilhørende funksjoner for bestilling, kurs, kundeoppfølging og betaling. Treneren plikter å overholde de øvrige vilkårene og retningslinjene som gjelder for funksjonene Treneren benytter.',
      ],
    },
    {
      title: '2. Hundetimers rolle',
      paragraphs: [
        'Hundetimer stiller en digital plattform til rådighet for formidling, bestilling og oppfølging av hundetrening, kurs, arrangementer og nettkurs.',
        'Treneren er leverandør av egne treningstjenester, undervisning og øvrig faglig innhold. Avtalen etablerer ikke et ansettelsesforhold, agentur eller partnerskap mellom partene.',
        'Hundetimer kan tilby funksjoner for betaling, kommunikasjon, kalender, kundehistorikk og utbetaling, enten gjennom plattformen eller ved bruk av tredjepartsleverandører.',
      ],
    },
    {
      title: '3. Opplysningsplikt og godkjenning',
      paragraphs: [
        'Treneren plikter å gi korrekte opplysninger om identitet, virksomhet, erfaring, kvalifikasjoner, priser og tjenester, og å holde opplysningene oppdatert.',
        'Hundetimer kan kreve dokumentasjon før godkjenning av trenerprofilen og senere når hensynet til sikkerhet, kvalitet eller kontroll tilsier det. Hundetimers godkjenning innebærer ingen garanti for Trenerens faglige nivå eller resultatet av tjenestene.',
        'Treneren har ansvar for nødvendige registreringer, tillatelser og forsikringer, samt for å oppfylle øvrige krav som gjelder for egen virksomhet og aktivitet.',
      ],
    },
    {
      title: '4. Profil, tjenester og tilgjengelighet',
      paragraphs: [
        'Treneren er ansvarlig for at publiserte opplysninger om priser, tjenesteinnhold, kapasitet, tilgjengelighet og sted er korrekte. Det samme gjelder øvrig innhold Treneren publiserer.',
        'Treneren skal holde kalender og kapasitet oppdatert. Treneren skal ikke bevisst tilby tidspunkter eller plasser som ikke kan stilles til rådighet.',
        'Hundetimer kan skjule eller rette åpenbart uriktige eller villedende opplysninger og anmode Treneren om å oppdatere profilen.',
      ],
    },
    {
      title: '5. Provisjon og gebyrer',
      paragraphs: [
        `Etter denne avtaleversjonen påløper ingen månedlig abonnementsavgift. For salg gjennom Hundetimers markedsplass har Hundetimer rett til ${String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} % av salgsbeløpet i plattformprovisjon.`,
        `Kunden betaler i tillegg et servicegebyr på ${CUSTOMER_SERVICE_FEE_NOK} kr per bestilling eller kjøp når gebyret fremgår ved betaling. Servicegebyret tilfaller Hundetimer og kommer i tillegg til Trenerens oppgitte pris.`,
        'Det beregnes ikke markedsplassprovisjon for avtaler og kunder som Treneren registrerer manuelt i Hundetimers kalender eller kundeverktøy, forutsatt at salget ikke er gjennomført via markedsplassen. Dersom betalingskostnader eller særskilte tjenester innføres senere, skal disse opplyses tydelig.',
        'Hundetimer kan endre priser og gebyrer med rimelig forhåndsvarsel. Vesentlige endringer skal varsles før ikrafttredelsen. Treneren kan avslutte avtalen dersom endringen ikke aksepteres.',
      ],
    },
    {
      title: '6. Betaling og utbetaling',
      paragraphs: [
        'Kundebetalinger kan behandles av Hundetimer, en ekstern betalingsleverandør eller begge. Treneren skal ikke forsøke å omgå en gjennomført bestilling på markedsplassen med sikte på å unngå plattformprovisjon.',
        'Vederlag for fullførte salg gjennom markedsplassen godskrives Trenerens utbetalingssaldo etter fradrag for avtalt plattformprovisjon, refusjoner, reverserte betalinger (chargebacks), korreksjoner og øvrige beløp som skal belastes Treneren etter avtalen.',
        'Planlagt utbetaling skjer den 10. og 25. i måneden. Fullførte salg fra 1. til 15. planlegges til utbetaling den 25. samme måned. Fullførte salg fra 16. til månedsslutt planlegges til utbetaling den 10. i neste måned. Dersom utbetalingsdagen ikke er en bankdag, kan utbetalingen skje neste bankdag.',
        'Treneren skal holde bank- og virksomhetsopplysninger korrekte og oppdaterte. Hundetimer kan holde tilbake utbetaling ved pågående refusjon, tvist, mistanke om misbruk, uriktige opplysninger eller andre forhold som må avklares før utbetaling.',
      ],
    },
    {
      title: '7. Avbestilling, refusjon og betalingsinnsigelser',
      paragraphs: [
        'Avbestilling og refusjon følger vilkårene som opplyses til kunden ved bestilling, og håndteres gjennom funksjonene for den aktuelle tjenesten.',
        'Ved hel eller delvis refusjon eller reversering av en betaling kan den delen av beløpet som ellers ville tilfalt Treneren, trekkes fra Trenerens nåværende eller fremtidige utbetalingssaldo.',
        'Ved betalingsinnsigelser skal Treneren bistå Hundetimer med nødvendig dokumentasjon om leveransen og øvrige forhold av betydning for saken.',
      ],
    },
    {
      title: '8. Levering, sikkerhet og dyrevelferd',
      paragraphs: [
        'Treneren er ansvarlig for planlegging og gjennomføring av egne tjenester, faglige råd og sikkerheten i egen aktivitet.',
        'Treneren plikter å ivareta hunder og mennesker på en forsvarlig måte og å overholde gjeldende regler om dyrevelferd, sikkerhet og øvrig relevant lovgivning.',
        'Hundetimer kan midlertidig skjule eller suspendere en trenerprofil ved alvorlige sikkerhetsmessige forhold, mistanke om mishandling, svindel eller trakassering, gjentatte alvorlige kundeklager eller andre vesentlige avtalebrudd.',
      ],
    },
    {
      title: '9. Kunder og kommunikasjon',
      paragraphs: [
        'Treneren skal opptre profesjonelt overfor kunder og besvare bestillingsforespørsler innen fristene som fremgår av plattformen.',
        'Kundeopplysninger mottatt gjennom Hundetimer skal bare benyttes til levering og oppfølging av de aktuelle tjenestene, med mindre kunden har gitt et særskilt og gyldig samtykke til annen bruk, herunder markedsføring.',
        'Treneren skal ikke selge, utlevere eller på annen måte benytte kundeopplysninger til uvedkommende formål.',
      ],
    },
    {
      title: '10. Personvern og kundeverktøy',
      paragraphs: [
        'Hundetimers behandling av personopplysninger som plattformoperatør er beskrevet i nettstedets personverninformasjon. Ved registrering av egne eksterne kunder i kunde- eller kalenderverktøy er Treneren ansvarlig for at registreringen og bruken av opplysningene har et lovlig behandlingsgrunnlag.',
        'Private trenernotater skal være saklige og begrenset til opplysninger som er relevante for oppfølgingen av kunden og hunden. Notater som deles med kunden, skal være egnet for slik deling.',
      ],
    },
    {
      title: '11. Vurderinger, moderering og omdømme',
      paragraphs: [
        'Kunder kan avgi vurderinger etter kjøp som gir adgang til dette på plattformen. Treneren kan besvare vurderinger gjennom Hundetimers funksjoner for slik kommunikasjon.',
        'Hundetimer kan moderere innhold som strider mot plattformens regler eller gjeldende rett, inneholder personangrep eller unødvendige personopplysninger, eller av andre grunner er uegnet for publisering på plattformen. Saklig kritikk skal ikke fjernes utelukkende fordi den er negativ.',
      ],
    },
    {
      title: '12. Innhold og nettkurs',
      paragraphs: [
        'Med mindre annet er avtalt, beholder Treneren eierskapet til eget originalt kursmateriell, bilder, videoer og øvrig innhold.',
        'Ved publisering gir Treneren Hundetimer en ikke-eksklusiv rett til å lagre, vise, distribuere og markedsføre innholdet i den utstrekning dette er nødvendig for levering og markedsføring av tjenesten.',
        'Kunders tilgang til kjøpt innhold kan opprettholdes etter avtalens opphør i den utstrekning dette er nødvendig for å oppfylle allerede gjennomførte kjøp.',
        'Treneren skal ha nødvendige rettigheter til materiale som lastes opp. Innholdet skal ikke krenke tredjeparts opphavsrett, varemerkerett eller andre rettigheter.',
      ],
    },
    {
      title: '13. Skatt, merverdiavgift og regnskap',
      paragraphs: [
        'Treneren er selv ansvarlig for skatt, merverdiavgift, bokføring, rapportering og øvrige økonomiske plikter knyttet til egen virksomhet og inntekt.',
        'Utbetalingsoversikter fra Hundetimer dokumenterer plattformens beregninger. Oversiktene fritar ikke Treneren fra ansvaret for korrekt regnskapsføring eller øvrige dokumentasjonskrav etter gjeldende regler.',
      ],
    },
    {
      title: '14. Drift og tredjepartstjenester',
      paragraphs: [
        'Hundetimer arbeider for stabil drift, men garanterer ikke uavbrutt eller feilfri tilgang til plattformen. Tilgjengeligheten kan påvirkes av vedlikehold, sikkerhetstiltak og feil hos underleverandører.',
        'Enkelte funksjoner kan avhenge av tredjepartsleverandører for blant annet betaling, e-post, kalender, hosting og datalagring.',
      ],
    },
    {
      title: '15. Suspensjon og avtalens opphør',
      paragraphs: [
        'Treneren kan anmode om at avtaleforholdet avsluttes. Før kontoen slettes eller stenges endelig, skal aktive bestillinger, kundetilganger, refusjoner og utestående utbetalinger håndteres.',
        'Hundetimer kan suspendere eller avslutte tilgangen ved vesentlig eller gjentatt avtalebrudd, svindel, alvorlige sikkerhetsproblemer, manglende lovpålagte opplysninger eller annen bruk som kan skade kunder, dyr, Hundetimer eller andre brukere.',
        'Avtalens opphør fritar ikke partene fra allerede oppståtte forpliktelser. Dette omfatter blant annet gjennomføring eller avvikling av eksisterende bestillinger, refusjoner, utbetalinger, kunders tilgang til kjøpt innhold og nødvendige dokumentasjonsplikter.',
      ],
    },
    {
      title: '16. Ansvar',
      paragraphs: [
        'Hver part er ansvarlig for egne handlinger, egne forpliktelser og tap som etter alminnelige regler kan tilskrives parten.',
        'Hundetimer er ikke ansvarlig for den faglige utførelsen eller resultatet av Trenerens tjenester. Avtalen begrenser ikke ansvar som ikke lovlig kan begrenses.',
      ],
    },
    {
      title: '17. Endringer i avtalen',
      paragraphs: [
        'Hundetimer kan endre avtalen som følge av endringer i plattformen, forretningsmodellen eller gjeldende regelverk. Vesentlige endringer skal varsles før de får virkning for Treneren.',
        'Dersom en ny avtaleversjon krever fornyet aksept, kan fortsatt bruk av enkelte funksjoner gjøres betinget av at Treneren aksepterer den nye versjonen.',
      ],
    },
    {
      title: '18. Lovvalg og tvister',
      paragraphs: [
        'Avtalen reguleres av norsk rett.',
        `Partene skal søke å løse tvister ved forhandlinger. Henvendelser til Hundetimer rettes til ${operator.supportEmail}. Dersom partene ikke oppnår enighet, kan tvisten bringes inn for ordinære norske domstoler etter gjeldende regler.`,
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
    `Språklig revidert ${TRAINER_AGREEMENT_REVISION_LABEL}`,
    `Plattformoperatør: ${operator.legalName}${operator.organisationNumber ? `, org.nr. ${operator.organisationNumber}` : ''}`,
    '',
  ];
  return [...header, ...trainerAgreementSections().flatMap((section) => [section.title, ...section.paragraphs, ''])].join('\n');
}
