'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export function AuthTurnstile({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState('Laster sikkerhetskontroll…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || ready) return;
    const timer = setTimeout(() => { onToken(''); setFailed(true); setMessage('Sikkerhetskontrollen kunne ikke lastes. Last siden på nytt og prøv igjen.'); }, 15000);
    return () => clearTimeout(timer);
  }, [siteKey, ready, onToken]);

  useEffect(() => {
    onToken('');
    if (!siteKey || !ready || !container.current || !window.turnstile) return;
    let active = true;
    setFailed(false);
    setMessage('Fullfør sikkerhetskontrollen før du fortsetter.');
    const clear = (text: string) => { if (active) { onToken(''); setMessage(text); setFailed(true); } };
    let id: string | undefined;
    try {
      id = window.turnstile.render(container.current, {
        sitekey: siteKey, theme: 'light', size: 'compact', language: 'nb',
        'response-field': false,
        callback: (token: string) => { if (active) { onToken(token); setFailed(false); setMessage('Sikkerhetskontrollen er fullført.'); } },
        'expired-callback': () => clear('Sikkerhetskontrollen har utløpt. Fullfør den på nytt.'),
        'timeout-callback': () => clear('Sikkerhetskontrollen tok for lang tid. Prøv igjen.'),
        'error-callback': () => { clear('Sikkerhetskontrollen mislyktes. Prøv igjen.'); return true; },
        'unsupported-callback': () => clear('Nettleseren støtter ikke sikkerhetskontrollen. Prøv en oppdatert nettleser.'),
        'refresh-expired': 'manual', retry: 'never',
      });
    } catch { clear('Sikkerhetskontrollen kunne ikke startes. Prøv igjen.'); }
    return () => { active = false; if (id !== undefined) window.turnstile?.remove(id); };
  }, [siteKey, ready, resetKey, retry, onToken]);

  if (!siteKey) return <p className="form-error" role="alert">Sikkerhetskontrollen er ikke konfigurert: NEXT_PUBLIC_TURNSTILE_SITE_KEY mangler. Innlogging og registrering er deaktivert inntil dette er rettet.</p>;
  return <div className="auth-turnstile">
    <Script id="hundetimer-turnstile" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} onError={() => { onToken(''); setFailed(true); setMessage('Sikkerhetskontrollen kunne ikke lastes. Last siden på nytt og prøv igjen.'); }} />
    <div ref={container} />
    <p className={failed ? 'form-error' : 'auth-field-hint'} role={failed ? 'alert' : 'status'}>{message}</p>
    {failed && <button className="btn secondary compact" type="button" onClick={() => { onToken(''); if (!window.turnstile) window.location.reload(); else setRetry(value => value + 1); }}>Prøv sikkerhetskontrollen igjen</button>}
  </div>;
}
