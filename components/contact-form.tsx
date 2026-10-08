'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { sendContactMessage, type ContactState } from '@/app/kontakt/actions';

export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactMessage, { status: 'idle', message: '' } as ContactState);
  if (state.status === 'success') return <div className="notice success" role="status"><h3>Meldingen er sendt</h3><p>{state.message}</p></div>;
  return <form action={action} className="contact-form" aria-busy={pending}>
    <fieldset disabled={pending}>
      <legend className="sr-only">Kontakt Hundetimer</legend>
      <div className="contact-form-grid">
        <label htmlFor="contact-name">Navn<input id="contact-name" name="name" autoComplete="name" required maxLength={100} /></label>
        <label htmlFor="contact-email">E-post<input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label className="contact-full" htmlFor="contact-topic">Hva gjelder det?<select id="contact-topic" name="topic" required defaultValue=""><option value="" disabled>Velg et emne</option>{['Booking', 'Betaling og refusjon', 'Konto og innlogging', 'Trenersøknad', 'Teknisk problem', 'Annet'].map(topic => <option key={topic}>{topic}</option>)}</select></label>
        <label className="contact-full" htmlFor="contact-message">Melding<textarea id="contact-message" name="message" rows={7} required minLength={10} maxLength={5000} aria-describedby="contact-help" /></label>
      </div>
      <div hidden aria-hidden="true"><label>La dette feltet stå tomt<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p id="contact-help" className="contact-help">Ta gjerne med bestillingsnummer hvis du har det. Ikke send passord eller kortopplysninger.</p>
      <p className="contact-help">Vi bruker opplysningene til å svare på henvendelsen din. <Link href="/personvern">Les om personvern</Link>.</p>
      {state.status === 'error' && <p className="notice error" role="alert">{state.message}</p>}
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Sender melding…' : 'Send melding'}</button>
    </fieldset>
  </form>;
}
