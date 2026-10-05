'use client';

import Link from 'next/link';
import { safeAuthNext } from '@/lib/auth-next';
import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const next = safeAuthNext(searchParams.get('next'));
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke logge inn.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit} aria-busy={loading}>
      <h1>Logg inn</h1>
      <p className="auth-intro">Velkommen tilbake. Bruk samme konto for hundetrening og trenertilgang.</p>
      <label>E-post<input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Passord<input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
      {searchParams.get('error') === 'callback' && !error ? <p className="form-error" role="alert">Bekreftelseslenken kunne ikke brukes. Prøv den nyeste lenken i e-posten din, eller logg inn hvis kontoen allerede er bekreftet.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn wide" type="submit" disabled={loading}>{loading ? 'Logger inn…' : 'Logg inn'}</button>
      <p className="muted small center">Ny her? <Link href={searchParams.get('next') ? `/register?next=${encodeURIComponent(safeAuthNext(searchParams.get('next')))}` : "/register"}>Opprett konto</Link></p>
    </form>
  );
}
