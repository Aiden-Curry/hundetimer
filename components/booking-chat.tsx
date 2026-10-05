'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { markBookingMessagesReadAction, sendBookingMessageAction } from '@/app/messages/actions';
import { ReportButton } from '@/components/report-button';

type ChatMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

function time(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

export function BookingChat({ bookingId, userId, initialMessages }: { bookingId: string; userId: string; initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  useEffect(() => {
    void markBookingMessagesReadAction(bookingId);
    const channel = supabase
      .channel(`booking-messages-${bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` }, (payload) => {
        const next = payload.new as ChatMessage;
        setMessages((current) => current.some((message) => message.id === next.id) ? current : [...current, next]);
        if (next.sender_id !== userId) void markBookingMessagesReadAction(bookingId);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` }, (payload) => {
        const next = payload.new as ChatMessage;
        setMessages((current) => current.map((message) => message.id === next.id ? next : message));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId, supabase, userId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text || isPending) return;
    setError('');
    startTransition(async () => {
      try {
        const message = await sendBookingMessageAction(bookingId, text);
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        setBody('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Meldingen kunne ikke sendes.');
      }
    });
  }

  return <div className="chat-shell">
    <div className="chat-messages" role="log" aria-label="Samtale" aria-live="polite">
      {messages.length ? messages.map((message) => {
        const mine = message.sender_id === userId;
        return <div className={`chat-row ${mine ? 'mine' : 'theirs'}`} key={message.id}>
          <div className="chat-bubble">
            <p>{message.body}</p>
            <span>{time(message.created_at)}{mine && message.read_at ? ' · Lest' : ''}</span>
            {!mine ? <ReportButton targetType="message" targetId={message.id} /> : null}
          </div>
        </div>;
      }) : <div className="chat-empty"><strong>Ingen meldinger ennå</strong><span>Send en melding om denne bestillingen.</span></div>}
      <div ref={endRef} />
    </div>
    <form className="chat-composer" onSubmit={submit}>
      <label htmlFor="booking-message">Din melding</label><textarea id="booking-message" value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={2000} placeholder="Skriv en melding..." />
      <div className="chat-composer-footer"><span className="muted small">{body.length}/2000</span><button className="btn" type="submit" disabled={isPending || !body.trim()}>{isPending ? 'Sender...' : 'Send melding'}</button></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  </div>;
}
