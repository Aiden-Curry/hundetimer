import { ShieldAlert } from 'lucide-react';
import { signOut } from '@/app/auth/actions';
import { trainerAgreementOperator } from '@/lib/legal/trainer-agreement';
import '@/app/auth/auth-pages.css';

export default function AccountSuspendedPage() {
  const { supportEmail } = trainerAgreementOperator();
  return <main className="account-access-page"><section className="account-status-card">
    <span className="account-status-icon"><ShieldAlert size={24} aria-hidden="true" /></span>
    <h1>Kontoen er midlertidig suspendert</h1>
    <p>Du kan ikke bruke markedsplassen mens kontoen er suspendert.</p>
    <div className="account-status-help"><h2>Mener du dette er en feil?</h2><p>Kontakt oss på <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Oppgi e-postadressen som er knyttet til kontoen, slik at vi kan undersøke saken.</p></div>
    <div className="account-status-actions"><form action={signOut}><button className="btn" type="submit">Logg ut</button></form></div>
  </section></main>;
}
