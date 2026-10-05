const fs=require('fs');const p='app/bli-trener/page.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("import Link from 'next/link';","import Link from 'next/link';\nimport './application.css';");
s=s.replace('ArrowRight, BadgeCheck, CalendarDays, CircleDollarSign, GraduationCap, HeartHandshake, LayoutDashboard, Megaphone, ShieldCheck, Users','ArrowRight, CalendarDays, GraduationCap, Users');
s=s.replace(/const features = \[[\s\S]*?\n\];/,`const features = [
  { icon: CalendarDays, title: 'Booking og kalender', text: 'Samle bestillinger fra Hundetimer og egne avtaler i samme kalender.' },
  { icon: Users, title: 'Kunder og oppfølging', text: 'Hold oversikt over kunder, hunder, treningsjournal og meldinger.' },
  { icon: GraduationCap, title: 'Dine treningstilbud', text: 'Tilby privattimer, gruppeaktiviteter og nettkurs fra en offentlig trenerprofil.' },
];`);
s=s.replace("type Status =", "type TrainerApplicationProfile = { business_name: string; city: string; bio: string | null; specialties: string[] | null; verification_status: Status; verification_review_note: string | null };\n\ntype Status =");
s=s.replace('let trainer: { business_name: string; city: string; bio: string | null; specialties: string[] | null; verification_status: Status; verification_review_note: string | null } | null = null;', 'let trainer: TrainerApplicationProfile | null = null;').replace('trainerResult.data as typeof trainer','trainerResult.data as TrainerApplicationProfile | null');
const start=s.indexOf('  return <main');const end=s.indexOf('    <section className="trainer-sales-section" id="soknad">',start);
s=s.slice(0,start)+`  return <main className="page-shell trainer-application-page">
    <header className="ta-hero">
      <div><h1>Bli hundetrener på Hundetimer</h1><p>Gjør treningstilbudene dine synlige for nye kunder, og samle booking, betaling og oppfølging på ett sted.</p><div className="trainer-sales-actions"><Link className="btn" href={ctaHref}>{ctaText}<ArrowRight size={17} aria-hidden="true" /></Link><a className="ta-text-link" href="#pris">Se priser og utbetaling</a></div></div>
      <aside className="ta-price-intro" aria-label="Prismodell"><span>Ingen månedsavgift</span><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} %</strong><p>provisjon på salg via markedsplassen</p><div>0 % på egne, manuelt registrerte kunder</div></aside>
    </header>

    <section className="ta-features" aria-label="Verktøy for hundetrenere">{features.map(({icon:Icon,title,text}) => <article key={title}><Icon size={22} aria-hidden="true" /><h2>{title}</h2><p>{text}</p></article>)}</section>

    <section className="ta-pricing" id="pris" aria-labelledby="ta-pricing-title"><div className="ta-section-heading"><h2 id="ta-pricing-title">Priser og utbetaling</h2><p>Ingen oppstartsavgift eller fast månedspris.</p></div><div className="ta-price-columns"><div><h3>Salg gjennom Hundetimer</h3><p><strong>{String(MARKETPLACE_COMMISSION_PERCENT).replace('.', ',')} % av salgsprisen</strong> for privattimer, kurs, arrangementer og nettkurs som selges gjennom markedsplassen. Kunden betaler et servicegebyr på {CUSTOMER_SERVICE_FEE_NOK} kr i tillegg.</p></div><div><h3>Egne kunder</h3><p><strong>Ingen markedsplassprovisjon.</strong> Registrer avtaler fra telefon, sosiale medier eller eksisterende kunder. Avtalene blokkerer kalenderen og kan knyttes til kundehistorikk og treningsjournal.</p></div></div><div className="ta-payout"><h3>Planlagte utbetalinger</h3><dl><div><dt>Fullført 1.–15.</dt><dd>Den 25. samme måned</dd></div><div><dt>Fullført 16.–månedsslutt</dt><dd>Den 10. neste måned</dd></div></dl></div><Link className="ta-text-link" href="/vilkar/treneravtale">Les treneravtalen<ArrowRight size={16} aria-hidden="true" /></Link></section>

    <div className="ta-application-layout"><aside className="ta-process"><h2>Fra søknad til trenerprofil</h2><ol>{steps.map(([title,text],index)=><li key={title}><span aria-hidden="true">{index+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></aside>

`+s.slice(end);
s=s.replace('    </section>\n  </main>;','    </section>\n    </div>\n  </main>;');
s=s.replace('<span className="eyebrow">Bli hundetrener på Hundetimer</span>','');
s=s.replace('className="form-success form-error-block"','className="form-success form-error-block" role="status"').replace('className="form-error form-error-block"','className="form-error form-error-block" role="alert"');
s=s.replace('<form className="verification-form" action={submitTrainerApplicationAction}>','<form className="verification-form" action={submitTrainerApplicationAction}><p className="ta-required-note">Navn, sted, beskrivelse og juridisk navn er obligatoriske. De øvrige feltene er valgfrie.</p>');
fs.writeFileSync(p,s);
