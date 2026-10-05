'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Role = 'owner' | 'trainer';

export function RegisterForm({ initialRole = 'owner', nextPath }: { initialRole?: Role; nextPath?: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(initialRole);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const next = nextPath && nextPath.startsWith('/') ? nextPath : (role === 'trainer' ? '/trainer-onboarding' : '/account');
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: { display_name: displayName, role },
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
    <form className="auth-card register-card" onSubmit={handleSubmit}>
      <span className="eyebrow">Opprett konto</span>
      <h1>Bli med</h1>
      <div className="role-picker" role="group" aria-label="Kontotype">
        <button type="button" className={role === 'owner' ? 'role-option active' : 'role-option'} onClick={() => setRole('owner')}>
          <strong>Hundeeier</strong><span>Finn og bestill trening</span>
        </button>
        <button type="button" className={role === 'trainer' ? 'role-option active' : 'role-option'} onClick={() => setRole('trainer')}>
          <strong>Hundetrener</strong><span>Tilby timer og kurs</span>
        </button>
      </div>
      <label>Navn<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
      <label>E-post<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Passord<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="btn wide" type="submit" disabled={loading}>{loading ? 'Oppretter…' : 'Opprett konto'}</button>
      <p className="muted small center">Har du allerede konto? <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}>Logg inn</Link></p>
    </form>
  );
}
