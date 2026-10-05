'use client';

import { FormEvent, useId, useRef, useState } from 'react';
import Link from 'next/link';

export function PlatformNewsletterSignup({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const id = useId();
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || submitting.current) return;
    submitting.current = true;
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Kunne ikke melde deg på akkurat nå.');
      setStatus('success');
      setMessage('Du er på listen! Vi sender deg relevante kurs, aktiviteter og nyheter fra Hundetimer.');
      setEmail('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Kunne ikke melde deg på akkurat nå.');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form aria-busy={status === 'loading'} className={compact ? 'newsletter-signup compact' : 'newsletter-signup'} onSubmit={submit}>
      <div className="newsletter-signup-fields">
        <label className="sr-only" htmlFor={`${id}-email`}>E-post til nyhetsbrev</label>
        <input
          id={`${id}-email`}
          aria-describedby={`${id}-consent ${id}-message`}
          aria-invalid={status === 'error' || undefined}
          maxLength={254}
          disabled={status === 'loading'}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="din@epost.no"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button className={compact ? 'btn btn-light compact' : 'btn'} type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Melder på...' : 'Meld meg på'}
        </button>
      </div>
      <p id={`${id}-consent`} className="newsletter-consent">Ved å melde deg på samtykker du til markedsføring på e-post fra Hundetimer. Du kan melde deg av når som helst. <Link href="/personvern">Les om personvern</Link>.</p>
      <p id={`${id}-message`} role={status === 'error' ? 'alert' : 'status'} className={`newsletter-message ${status}`}>{message}</p>
    </form>
  );
}
