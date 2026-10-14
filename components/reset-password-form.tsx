'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (password.length < 10) { setError('Passordet må ha minst 10 tegn.'); return; }
    if (password !== confirmation) { setError('Passordene er ikke like. Skriv det samme passordet i begge feltene.'); return; }
    submitting.current = true;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: sessionError } = await supabase.auth.getUser();
      if (!user || sessionError) { router.replace('/forgot-password?error=recovery'); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        if (updateError.status === 401 || updateError.status === 403 || ['session_not_found', 'session_expired', 'refresh_token_not_found', 'user_not_found'].includes(updateError.code || '')) {
          router.replace('/forgot-password?error=recovery'); return;
        }
        setError(updateError.code === 'same_password' ? 'Velg et annet passord enn det du har brukt tidligere.' : 'Passordet kunne ikke lagres. Bruk minst 10 tegn og prøv igjen.');
        return;
      }
      setPassword(''); setConfirmation(''); setSaved(true);
    } catch { setError('Vi fikk ikke lagret passordet akkurat nå. Prøv igjen om litt.'); }
    finally { submitting.current = false; setLoading(false); }
  }

  if (saved) return <section className="auth-card"><h1>Passordet er oppdatert</h1><p role="status">Det nye passordet er lagret. Du kan bruke det neste gang du logger inn på Hundetimer.</p><Link className="btn" href="/account">Fortsett til Min side</Link></section>;
  return <form className="auth-card" onSubmit={submit} aria-busy={loading}>
    <h1>Lag et nytt passord</h1><p className="auth-intro">Velg et passord med minst 10 tegn. Du kan gjerne bruke flere.</p>
    <label>Nytt passord<input name="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={event => setPassword(event.target.value)} disabled={loading} /></label>
    <label>Gjenta passordet<input name="confirmation" type="password" autoComplete="new-password" required minLength={10} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={loading} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="btn wide" type="submit" disabled={loading}>{loading ? 'Lagrer…' : 'Lagre nytt passord'}</button>
    <p className="muted small center"><Link href="/forgot-password">Trenger du en ny lenke?</Link></p>
  </form>;
}
