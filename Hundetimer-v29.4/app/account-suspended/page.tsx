import { signOut } from '@/app/auth/actions';

export default function AccountSuspendedPage() {
  return <main className="page-shell narrow"><section className="empty-state suspended-page"><span className="eyebrow">Konto suspendert</span><h1>Denne kontoen er midlertidig suspendert</h1><p className="muted">Du kan ikke bruke markedsplassen mens kontoen er suspendert. Hvis du mener dette er feil, kontakt kundestøtte når kontaktinformasjonen vår er publisert.</p><form action={signOut}><button className="btn" type="submit">Logg ut</button></form></section></main>;
}
