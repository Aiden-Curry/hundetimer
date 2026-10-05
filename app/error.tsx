'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page-shell ui-state-page"><section className="ui-state-card" aria-labelledby="page-error-title">
    <span className="eyebrow">Noe gikk galt</span><h1 id="page-error-title">Vi fikk ikke lastet denne siden</h1>
    <p>Prøv igjen. Hvis problemet fortsetter, kan du gå til forsiden og prøve på nytt senere.</p>
    <div className="ui-state-actions"><button className="btn" type="button" onClick={reset}>Prøv igjen</button><Link className="btn secondary" href="/">Til forsiden</Link></div>
  </section></main>;
}
