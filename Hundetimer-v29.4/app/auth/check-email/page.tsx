import Link from 'next/link';

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = '/' } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="setup-card">
        <span className="eyebrow">Nesten ferdig</span>
        <h1>Sjekk e-posten din</h1>
        <p className="muted">Trykk på bekreftelseslenken fra oss. Etterpå sender vi deg videre til neste steg.</p>
        <Link className="btn" href={`/login?next=${encodeURIComponent(next)}`}>Til innlogging</Link>
      </section>
    </main>
  );
}
