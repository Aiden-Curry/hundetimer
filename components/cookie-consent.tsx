'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Dialog } from '@/components/dialog';

const COOKIE_NAME = 'hundetimer_cookie_consent';
const CONSENT_VERSION = '1';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const SETTINGS_EVENT = 'hundetimer:cookie-settings';

type ConsentChoice = {
  analytics: boolean;
  marketing: boolean;
};

function readConsentCookie() {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as { version?: string; analytics?: boolean; marketing?: boolean };
    if (value.version !== CONSENT_VERSION || typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean') return null;
    return value;
  } catch {
    return null;
  }
}

function writeConsentCookie(choice: ConsentChoice) {
  const value = encodeURIComponent(JSON.stringify({
    version: CONSENT_VERSION,
    analytics: choice.analytics,
    marketing: choice.marketing,
    savedAt: new Date().toISOString(),
  }));
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent('hundetimer:cookie-consent-changed', { detail: choice }));
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState('');
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = readConsentCookie();
    if (!existing) setOpen(true);
    else {
      setAnalytics(Boolean(existing.analytics));
      setMarketing(Boolean(existing.marketing));
    }

    const showSettings = () => {
      const current = readConsentCookie();
      setAnalytics(Boolean(current?.analytics));
      setMarketing(Boolean(current?.marketing));
      setError('');
      setModal(true);
      setCustomize(true);
      setOpen(true);
    };
    window.addEventListener(SETTINGS_EVENT, showSettings);
    return () => window.removeEventListener(SETTINGS_EVENT, showSettings);
  }, []);

  function save(choice: ConsentChoice) {
    try { writeConsentCookie(choice); } catch { setError('Valget kunne ikke lagres. Kontroller at nettleseren tillater nødvendige informasjonskapsler.'); return; }
    setAnalytics(choice.analytics);
    setMarketing(choice.marketing);
    setOpen(false);
    setCustomize(false);
  }

  if (!open) return null;

  const content = <>
      <div className="cookie-consent-copy">
        <span className="eyebrow">Personvern</span>
        {!modal ? <h2 id="cookie-consent-title">Informasjonskapsler</h2> : null}
        <p>
          Hundetimer bruker nødvendige informasjonskapsler for blant annet innlogging, sikkerhet og funksjoner du ber om.
          Med samtykke kan vi også bruke analyse og markedsføring. Ikke-nødvendige informasjonskapsler aktiveres ikke uten ditt valg.
        </p>
        <Link href="/personvern">Les om personvern og informasjonskapsler</Link>
      </div>

      {customize ? (
        <div className="cookie-consent-options">
          <label className="cookie-choice locked">
            <input type="checkbox" checked readOnly disabled />
            <span><strong>Nødvendige</strong><small>Alltid på. Brukes for innlogging, sikkerhet og grunnleggende funksjoner.</small></span>
          </label>
          <label className="cookie-choice">
            <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
            <span><strong>Analyse</strong><small>Hjelper oss å forstå hvordan Hundetimer brukes. Ingen analyseverktøy er aktivert nå.</small></span>
          </label>
          <label className="cookie-choice">
            <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
            <span><strong>Markedsføring</strong><small>Kan brukes til relevant annonsering dersom slike verktøy aktiveres senere.</small></span>
          </label>
        </div>
      ) : null}

      {error ? <p role="alert" className="form-error form-error-block">{error}</p> : null}
      <div className="cookie-consent-actions">
        {customize ? (
          <button className="btn" type="button" onClick={() => save({ analytics, marketing })}>Lagre valg</button>
        ) : (
          <button className="btn" type="button" onClick={() => save({ analytics: true, marketing: true })}>Godta alle</button>
        )}
        <button className="btn secondary" type="button" onClick={() => save({ analytics: false, marketing: false })}>Kun nødvendige</button>
        <button className="cookie-text-button" type="button" onClick={() => setCustomize((value) => !value)}>{customize ? 'Skjul innstillinger' : 'Tilpass'}</button>
      </div>
    </>;
  return modal ? <Dialog open={open} title="Personvernvalg" className="cookie-settings-dialog" onClose={() => { setOpen(false); setCustomize(false); }}>{content}</Dialog> : <aside className="cookie-consent" aria-labelledby="cookie-consent-title">{content}</aside>;
}

export function CookieSettingsButton() {
  return (
    <button className="footer-cookie-button" type="button" onClick={() => window.dispatchEvent(new Event(SETTINGS_EVENT))}>
      Informasjonskapsler
    </button>
  );
}
