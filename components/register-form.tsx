'use client';

import Link from 'next/link';
import { safeAuthNext } from '@/lib/auth-next';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function RegisterForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const next = safeAuthNext(nextPath, '/account');
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: { display_name: displayName, newsletter_opt_in: newsletterOptIn },
        },
      });

      if (authError) throw authError;

      if (data.session) {
        router.push(next);
        router.refresh();
      } else {
        router.push(`/auth/check-email?next=${encodeURIComponent(next)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke opprette konto.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-card register-card" onSubmit={handleSubmit} aria-busy={loading}>
      <h1>Opprett konto</h1>
      <p className="auth-intro">Én konto brukes til bestillinger, hunder, kurs og nettkurs. Hvis du senere søker om å bli hundetrener, bruker du den samme kontoen.</p>
      <label>Navn<input name="displayName" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
      <label>E-post<input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Passord<input type="password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} aria-describedby="password-hint" /><span id="password-hint" className="auth-field-hint">Minst 6 tegn.</span></label>
      <label className="checkbox-row auth-newsletter-optin"><input type="checkbox" name="newsletterOptIn" checked={newsletterOptIn} onChange={(e) => setNewsletterOptIn(e.target.checked)} /><span><strong>Ja takk til nyheter fra Hundetimer</strong><small>Send meg relevante hundetrenere, kurs, aktiviteter og tilbud på e-post. Frivillig, og du kan melde deg av når som helst.</small></span></label>
      <p className="auth-privacy-note">Les hvordan vi behandler opplysningene dine i <Link href="/personvern">personverninformasjonen</Link>.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn wide" type="submit" disabled={loading}>{loading ? 'Oppretter…' : 'Opprett konto'}</button>
      <p className="muted small center">Har du allerede konto? <Link href={nextPath ? `/login?next=${encodeURIComponent(safeAuthNext(nextPath, '/account'))}` : '/login'}>Logg inn</Link></p>
    </form>
  );
}
