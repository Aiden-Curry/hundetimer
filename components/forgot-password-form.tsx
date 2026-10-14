'use client';

import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';
import { AuthTurnstile } from '@/components/auth-turnstile';
import { createClient } from '@/lib/supabase/client';

export function ForgotPasswordForm({ invalidLink = false }: { invalidLink?: boolean }) {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !captchaToken || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) return;
    submitting.current = true;
    setLoading(true);
    setCaptchaToken('');
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        captchaToken,
        redirectTo: `${window.location.origin}/auth/callback?next=%2Freset-password`,
      });
      if (error) throw error;
    } catch {
      // Never expose provider errors that could identify an existing account.
      setCaptchaReset(value => value + 1);
    } finally {
      setSent(true);
      setLoading(false);
      submitting.current = false;
    }
  }

  if (sent) return <section className="auth-card"><h1>Sjekk e-posten din</h1><p role="status">Hvis e-postadressen finnes hos oss, sender vi deg en lenke for å lage et nytt passord.</p><p className="muted small">Se også i søppelposten. Hvis e-posten ikke kommer, kan du prøve igjen om litt. Bruk den nyeste lenken du mottar.</p><button className="btn secondary" type="button" onClick={() => { setCaptchaToken(''); setCaptchaReset(value => value + 1); setSent(false); }}>Prøv igjen</button><Link className="btn" href="/login">Til innlogging</Link></section>;
  return <form className="auth-card" onSubmit={submit} aria-busy={loading}>
    <h1>Glemt passordet?</h1>
    <p className="auth-intro">Skriv inn e-postadressen du bruker på Hundetimer, så kan du få en lenke for å lage et nytt passord.</p>
    {invalidLink && <p className="form-error" role="alert">Lenken er utløpt eller kan ikke brukes. Be om en ny lenke nedenfor.</p>}
    <label>E-post<input name="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={loading} /></label>
    <AuthTurnstile onToken={setCaptchaToken} resetKey={captchaReset} />
    <button className="btn wide" type="submit" disabled={loading || !captchaToken}>{loading ? 'Sender…' : 'Send lenke'}</button>
    <p className="muted small center"><Link href="/login">Tilbake til innlogging</Link></p>
  </form>;
}
