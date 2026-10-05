import Link from 'next/link';
import { Mail } from 'lucide-react';
import { safeAuthNext } from '@/lib/auth-next';
import '../auth-pages.css';

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeAuthNext(params.next, '/account');
  return <main className="account-access-page"><section className="account-status-card">
    <span className="account-status-icon"><Mail size={24} aria-hidden="true" /></span>
    <h1>Sjekk e-posten din</h1>
    <p>Åpne e-posten fra Hundetimer og trykk på bekreftelseslenken for å bekrefte kontoen din. Deretter fortsetter du der du slapp.</p>
    <div className="account-status-help"><h2>Finner du ikke e-posten?</h2><p>Det kan ta noen minutter før den kommer. Sjekk også søppelpostmappen, og bruk den nyeste bekreftelseslenken hvis du har fått flere e-poster.</p></div>
    <div className="account-status-actions"><Link className="btn" href={`/login?next=${encodeURIComponent(next)}`}>Til innlogging</Link><Link className="btn secondary" href={`/register?next=${encodeURIComponent(next)}`}>Bruk en annen e-postadresse</Link></div>
  </section></main>;
}
