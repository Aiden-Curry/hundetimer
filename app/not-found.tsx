import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import './not-found.css';

export default function NotFound() {
  return (
    <main className="page-shell missing-page" aria-labelledby="missing-title">
      <div className="missing-art">
        <Image
          className="missing-dog"
          src="/images/Playful Dog with Torn Paper.png"
          alt="En leken, trefarget hund løper av gårde med et revet ark i munnen og ser tilbake."
          width={1280}
          height={1280}
          sizes="(max-width: 380px) 190px, (max-width: 760px) 210px, 320px"
          priority
        />
      </div>
      <div className="missing-copy">
        <span className="missing-label">404 · Siden finnes ikke</span>
        <h1 id="missing-title">Denne siden har stukket av.</h1>
        <p>Vi ropte «kom!», men den hørte ikke etter. Siden kan ha blitt flyttet, eller lenken kan være feil.</p>
        <div className="missing-actions">
          <Link className="btn" href="/">Til forsiden<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link className="btn secondary" href="/discover">Finn hundetrening</Link>
        </div>
        <p className="missing-footnote">Kanskje vi også trenger et kurs i innkalling.</p>
      </div>
    </main>
  );
}
