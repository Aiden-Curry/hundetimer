'use client';

import Link from 'next/link';
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

      const next = searchParams.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke logge inn.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <span className="eyebrow">Velkommen tilbake</span>
      <h1>Logg inn</h1>
      <label>E-post<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Passord<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn wide" type="submit" disabled={loading}>{loading ? 'Logger inn…' : 'Logg inn'}</button>
      <p className="muted small center">Ny her? <Link href={searchParams.get('next') ? `/register?next=${encodeURIComponent(searchParams.get('next') || '')}` : "/register"}>Opprett konto</Link></p>
    </form>
  );
}
