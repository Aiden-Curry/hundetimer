'use client';

import Link from 'next/link';
import { safeAuthNext } from '@/lib/auth-next';
import { FormEvent, useRef, useState } from 'react';
import { AuthTurnstile } from '@/components/auth-turnstile';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !captchaToken || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) return;
    submitting.current = true;
    setCaptchaToken('');
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
      if (authError) throw authError;

      const next = safeAuthNext(searchParams.get('next'));
      router.push(next);
      router.refresh();
    } catch (err) {
      setCaptchaToken('');
      setCaptchaReset(value => value + 1);
      setError(err instanceof Error ? err.message : 'Kunne ikke logge inn.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit} aria-busy={loading}>
      <h1>Logg inn</h1>
      <p className="auth-intro">Velkommen tilbake. Bruk samme konto for hundetrening og trenertilgang.</p>
      <label>E-post<input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Passord<input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <Link className="auth-field-hint" href="/forgot-password">Glemt passordet?</Link>
      {searchParams.get('error') === 'callback' && !error ? <p className="form-error" role="alert">Bekreftelseslenken kunne ikke brukes. Prøv den nyeste lenken i e-posten din, eller logg inn hvis kontoen allerede er bekreftet.</p> : null}
      <AuthTurnstile onToken={setCaptchaToken} resetKey={captchaReset} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn wide" type="submit" disabled={loading || !captchaToken}>{loading ? 'Logger inn…' : 'Logg inn'}</button>
      <p className="muted small center">Ny her? <Link href={searchParams.get('next') ? `/register?next=${encodeURIComponent(safeAuthNext(searchParams.get('next')))}` : "/register"}>Opprett konto</Link></p>
    </form>
  );
}
