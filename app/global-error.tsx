'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="nb"><body style={{ margin: 0, background: '#fbfaf6', color: '#213e32', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
    <main style={{ maxWidth: 600, margin: '12vh auto', padding: 28 }}>
      <a href="/" style={{ color: 'inherit', fontWeight: 700 }}>Hundetimer</a>
      <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.2 }}>Siden kunne ikke lastes</h1>
      <p>Prøv igjen om et øyeblikk.</p>
      <button type="button" onClick={reset} style={{ background: '#213e32', color: '#fff', border: 0, borderRadius: 10, padding: '14px 22px', font: 'inherit', cursor: 'pointer' }}>Prøv igjen</button>
    </main>
  </body></html>;
}
