import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, HeartHandshake, Laptop, Mail, MapPin, Search, ShieldCheck } from 'lucide-react';
import { PlatformNewsletterSignup } from '@/components/platform-newsletter-signup';

const trainingOptions = [
  { icon: HeartHandshake, title: 'Privattimer', text: 'Få hjelp av en trener som tar utgangspunkt i deg og hunden din. Dere avtaler hva dere vil jobbe med.', href: '/discover?type=private', label: 'Finn en hundetrener' },
  { icon: CalendarDays, title: 'Kurs og aktiviteter', text: 'Bli med på valpekurs, tren sammen med andre eller prøv en ny aktivitet med hunden din.', href: '/discover?type=activities', label: 'Se kurs og aktiviteter' },
  { icon: Laptop, title: 'Nettkurs', text: 'Se leksjonene når du har tid, og prøv øvelsene hjemme. Du kan gå tilbake til dem underveis.', href: '/online-courses', label: 'Se nettkurs' },
];

export default function Home() {
  return (
    <main className="home-page home-refresh">
      <section className="welcome-section" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <h1 id="welcome-title">Finn en hundetrener<br /><em>nær deg.</em></h1>
          <p>Få hjelp med valpetrening, innkalling eller en hund som trekker i båndet. Her finner du hundetrenere og kurs i nærheten, og nettkurs du kan følge hjemmefra.</p>
          <form className="welcome-search" action="/discover" method="get" role="search" aria-label="Finn hundetrening">
            <label><Search size={19} aria-hidden="true" /><span>Hva vil du trene på?</span><input name="q" placeholder="Valp, passering, innkalling …" /></label>
            <label><MapPin size={19} aria-hidden="true" /><span>Hvor?</span><input name="place" placeholder="By eller sted" /></label>
            <button className="btn" type="submit">Finn trening <ArrowRight size={18} aria-hidden="true" /></button>
          </form>
          <div className="welcome-topics"><span>Utforsk</span><Link href="/discover?q=valp">Valpetrening</Link><Link href="/discover?q=passering">Passering</Link><Link href="/discover?q=innkalling">Innkalling</Link></div>
        </div>
        <figure className="welcome-photo">
          <Image src="/images/golden-retriever.jpg" alt="En golden retriever-valp sitter ute med en blomst i munnen" fill priority sizes="(max-width: 760px) 100vw, 45vw" />
        </figure>
      </section>
      <div className="welcome-reassurance"><span><ShieldCheck size={19} aria-hidden="true" /> Verifiserte trenere</span><span><CalendarDays size={19} aria-hidden="true" /> Se ledige timer</span><span><HeartHandshake size={19} aria-hidden="true" /> Kontakt med treneren på Min side</span></div>
      <section className="training-section" aria-labelledby="training-title">
        <div className="home-section-heading"><div><h2 id="training-title">Hvordan vil du trene?</h2></div><p>Du kan bestille en privattime, melde deg på et kurs eller følge et nettkurs hjemme.</p></div>
        <div className="training-options">
          {trainingOptions.map(({ icon: Icon, title, text, href, label }) => <Link className="training-option" href={href} key={title}><Icon size={26} strokeWidth={1.5} aria-hidden="true" /><h3>{title}</h3><p>{text}</p><span>{label}<ArrowRight size={18} aria-hidden="true" /></span></Link>)}
        </div>
      </section>
      <section className="together-section" aria-labelledby="together-title">
        <div className="together-photo"><Image src="/images/dog-outdoors.jpg" alt="En brun og hvit hund nyter en rolig stund på stranden" fill sizes="(max-width: 760px) 100vw, 45vw" /></div>
        <div className="together-copy"><h2 id="together-title">Finn og bestill<br />hundetrening.</h2><ol className="training-steps"><li><div><h3>Søk i nærheten av deg</h3><p>Skriv inn hvor du bor og hva du vil trene på, for eksempel innkalling eller passering.</p></div></li><li><div><h3>Les om trenerne</h3><p>Se hva de tilbyr, hva det koster og hvilke tider som er ledige. Du kan også lese vurderinger fra andre hundeeiere.</p></div></li><li><div><h3>Send en bestilling</h3><p>Velg en time eller et kurs. På Min side kan du følge bestillingen og sende meldinger til treneren.</p></div></li></ol><Link className="text-link" href="/discover">Se hundetrenere og kurs <ArrowRight size={17} aria-hidden="true" /></Link></div>
      </section>
      <section className="home-newsletter-section" aria-labelledby="home-newsletter-title"><div className="home-newsletter-copy"><Mail size={28} strokeWidth={1.5} aria-hidden="true" /><div><span className="eyebrow">Nyhetsbrev</span><h2 id="home-newsletter-title">Få beskjed om nye kurs.</h2><p>Vi sender deg e-post om nye kurs, trenere og tilbud på Hundetimer. Du kan melde deg av når du vil.</p></div></div><PlatformNewsletterSignup /></section>
      <section className="trainer-invitation"><div><h2>Jobber du som<br />hundetrener?</h2><p>På Hundetimer kan du tilby privattimer, sette opp gruppekurs og selge nettkurs. Du får oversikt over bestillinger og kunder på ett sted.</p></div><Link className="btn btn-light" href="/bli-trener">Søk om trenerprofil <ArrowRight size={18} aria-hidden="true" /></Link></section>
    </main>
  );
}
