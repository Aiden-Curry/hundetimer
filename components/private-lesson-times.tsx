'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Check, Clock3 } from 'lucide-react';

type Slot = { id: string; starts_at: string; ends_at: string };
const dateKey = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', ...options }).format(new Date(value));

export function PrivateLessonTimes({ slots, selectedId, serviceId, promo }: { slots: Slot[]; selectedId?: string; serviceId: string; promo?: string }) {
  const days = [...new Map(slots.map(slot => [dateKey(slot.starts_at), slot.starts_at])).entries()];
  const initial = slots.find(slot => slot.id === selectedId) || slots[0];
  const [day, setDay] = useState(initial ? dateKey(initial.starts_at) : '');
  const panelId = useId();
  const daySlots = slots.filter(slot => dateKey(slot.starts_at) === day);
  return <div className="pb-time-picker">
    <div className="pb-days" aria-label="Ledige datoer">{days.map(([key, value]) => <button type="button" key={key} aria-pressed={day === key} aria-controls={panelId} aria-label={dateLabel(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onClick={() => setDay(key)}><span>{dateLabel(value, { weekday: 'short' })}</span><strong>{dateLabel(value, { day: 'numeric' })}</strong><span>{dateLabel(value, { month: 'short' })}</span></button>)}</div>
    <div id={panelId} className="pb-time-panel"><p className="pb-day-label" aria-live="polite">{daySlots[0] && dateLabel(daySlots[0].starts_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><div className="pb-times">{daySlots.map(slot => {
      const params = new URLSearchParams({ slot: slot.id });
      if (promo) params.set('promo', promo);
      const selected = selectedId === slot.id;
      return <Link key={slot.id} href={`/book/${serviceId}?${params}`} scroll={false} aria-current={selected ? 'true' : undefined} aria-label={`Velg ${dateLabel(slot.starts_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`}><Clock3 size={15} aria-hidden="true" /><span>{dateLabel(slot.starts_at, { hour: '2-digit', minute: '2-digit' })}–{dateLabel(slot.ends_at, { hour: '2-digit', minute: '2-digit' })}</span>{selected && <Check size={15} aria-hidden="true" />}</Link>;
    })}</div></div>
    <p className="pb-time-hint">Alle tider vises i norsk tid. Velg et klokkeslett for å oppdatere bestillingen.</p>
  </div>;
}
