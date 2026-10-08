'use server';

import { randomUUID } from 'node:crypto';
import { sendTransactionalEmail } from '@/lib/email/server';
import { trainerAgreementOperator } from '@/lib/legal/trainer-agreement';

export type ContactState = { status: 'idle' | 'error' | 'success'; message: string };

export async function sendContactMessage(_: ContactState, form: FormData): Promise<ContactState> {
  const value = (key: string) => String(form.get(key) || '').trim();
  const name = value('name'), email = value('email'), topic = value('topic'), message = value('message');
  if (value('website')) return { status: 'error', message: 'Meldingen kunne ikke sendes. Kontakt oss på e-post i stedet.' };
  if (!name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)
    || !['Booking', 'Betaling og refusjon', 'Konto og innlogging', 'Trenersøknad', 'Teknisk problem', 'Annet'].includes(topic)
    || message.length < 10 || message.length > 5000) {
    return { status: 'error', message: 'Fyll inn navn, en gyldig e-postadresse og hva saken gjelder. Meldingen må være mellom 10 og 5000 tegn.' };
  }
  const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const text = `Navn: ${name}\nE-post: ${email}\nEmne: ${topic}\n\n${message}`;
  try {
    const result = await sendTransactionalEmail({
      to: trainerAgreementOperator().supportEmail, replyTo: email,
      subject: `Kontaktskjema: ${topic}`, text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escape(text)}</div>`,
      idempotencyKey: `contact/${randomUUID()}`,
    });
    if (result.skipped) throw new Error('Email unavailable');
    return { status: 'success', message: 'Takk! Meldingen er sendt. Vi svarer på e-postadressen du oppga, normalt innen 1–2 virkedager.' };
  } catch {
    return { status: 'error', message: 'Vi fikk ikke sendt meldingen akkurat nå. Prøv igjen, eller bruk e-postadressen nedenfor.' };
  }
}
