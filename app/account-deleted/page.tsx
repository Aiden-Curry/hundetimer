import Link from 'next/link';
import { Check } from 'lucide-react';
import '@/app/auth/auth-pages.css';

export default function AccountDeletedPage() {
  return <main className="account-access-page"><section className="account-status-card">
    <span className="account-status-icon"><Check size={24} aria-hidden="true" /></span>
    <h1>Kontoen er slettet</h1>
    <p>Kontoen er ikke lenger aktiv. Personlige profildata er fjernet eller anonymisert.</p>
    <div className="account-status-help"><h2>Opplysninger som fortsatt må lagres</h2><p>Opplysninger som må beholdes for betaling, regnskap, refusjoner, sikkerhet eller tvister kan fortsatt lagres i begrenset form.</p></div>
    <div className="account-status-actions"><Link className="btn" href="/">Til forsiden</Link><Link className="btn secondary" href="/personvern">Les om personvern</Link></div>
  </section></main>;
}
