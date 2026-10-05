import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, HeartHandshake, Laptop, Mail, MapPin, Search, ShieldCheck } from 'lucide-react';
import { PlatformNewsletterSignup } from '@/components/platform-newsletter-signup';

const trainingOptions = [
  { icon: HeartHandshake, title: 'Privattimer', text: 'Personlig veiledning, med tid til akkurat det dere trenger.', href: '/discover?type=private', label: 'Finn en hundetrener' },
  { icon: CalendarDays, title: 'Kurs og aktiviteter', text: 'Lær sammen med andre. Fra valpekurs til nye utfordringer.', href: '/discover?type=activities', label: 'Utforsk kurs' },
  { icon: Laptop, title: 'Nettkurs', text: 'Gode treningsvaner starter hjemme. Lær i deres eget tempo.', href: '/online-courses', label: 'Se nettkurs' },
];

export default function Home() {
  return (
    <main className="home-page home-refresh">
      <section className="welcome-section" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <h1 id="welcome-title">En god hverdag.<br /><em>For dere begge.</em></h1>
          <p>Finn hundetreneren som passer dere. Utforsk privattimer, kurs og aktiviteter – og ta neste steg sammen.</p>
          <form className="welcome-search" action="/discover" method="get" role="search" aria-label="Finn hundetrening">
            <label><Search size={19} aria-hidden="true" /><span>Hva vil dere lære?</span><input name="q" placeholder="Valp, passering, innkalling …" /></label>
            <label><MapPin size={19} aria-hidden="true" /><span>Hvor?</span><input name="place" placeholder="By eller sted" /></label>
            <button className="btn" type="submit">Finn trening <ArrowRight size={18} aria-hidden="true" /></button>
          </form>
          <div className="welcome-topics"><span>Utforsk</span><Link href="/discover?q=valp">Valpetrening</Link><Link href="/discover?q=passering">Passering</Link><Link href="/discover?q=innkalling">Innkalling</Link></div>
        </div>
        <figure className="welcome-photo">
          <Image src="/images/golden-retriever.jpg" alt="En golden retriever-valp sitter ute med en blomst i munnen" fill priority sizes="(max-width: 760px) 100vw, 45vw" />
          <figcaption>Mer mestring. Flere fine øyeblikk.</figcaption>
        </figure>
      </section>
      <div className="welcome-reassurance"><span><ShieldCheck size={19} aria-hidden="true" /> Verifiserte trenere</span><span><CalendarDays size={19} aria-hidden="true" /> Finn ledige timer</span><span><HeartHandshake size={19} aria-hidden="true" /> Trening på deres premisser</span></div>
      <section className="training-section" aria-labelledby="training-title">
        <div className="home-section-heading"><div><h2 id="training-title">Litt hjelp. Stor forskjell.</h2></div><p>Enten dere er helt i starten eller klare for noe nytt, finnes det en treningsform som passer.</p></div>
        <div className="training-options">
          {trainingOptions.map(({ icon: Icon, title, text, href, label }) => <Link className="training-option" href={href} key={title}><Icon size={26} strokeWidth={1.5} aria-hidden="true" /><h3>{title}</h3><p>{text}</p><span>{label}<ArrowRight size={18} aria-hidden="true" /></span></Link>)}
        </div>
      </section>
      <section className="together-section" aria-labelledby="together-title">
        <div className="together-photo"><Image src="/images/dog-outdoors.jpg" alt="En brun og hvit hund nyter en rolig stund på stranden" fill sizes="(max-width: 760px) 100vw, 45vw" /></div>
        <div className="together-copy"><h2 id="together-title">Neste steg er enklere<br />enn du tror.</h2><ol className="training-steps"><li><div><h3>Finn riktig hjelp</h3><p>Søk etter det dere vil øve på, der dere bor eller på nett.</p></div></li><li><div><h3>Velg det som passer</h3><p>Bli kjent med trenerne. Se priser, vurderinger og ledige tider.</p></div></li><li><div><h3>Gled dere til trening</h3><p>Bestill og betal, og hold kontakten med treneren på Min side.</p></div></li></ol><Link className="text-link" href="/discover">Finn deres neste steg <ArrowRight size={17} aria-hidden="true" /></Link></div>
      </section>
      <section className="home-newsletter-section" aria-labelledby="home-newsletter-title"><div className="home-newsletter-copy"><Mail size={28} strokeWidth={1.5} aria-hidden="true" /><div><span className="eyebrow">Hold deg oppdatert</span><h2 id="home-newsletter-title">Nye kurs og hundetrenere, rett i innboksen.</h2><p>Få relevante nyheter om hundetrening, aktiviteter, nye trenere og tilbud fra Hundetimer.</p></div></div><PlatformNewsletterSignup /></section>
      <section className="trainer-invitation"><div><h2>Mer tid til hundene.<br />Mindre administrasjon.</h2><p>Samle booking, kunder og kurs på ett sted, og gjør det enkelt for nye kunder å finne deg.</p></div><Link className="btn btn-light" href="/bli-trener">Bli med som trener <ArrowRight size={18} aria-hidden="true" /></Link></section>
    </main>
  );
}
