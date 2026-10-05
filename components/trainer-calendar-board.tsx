'use client';

import { useMemo, useState } from 'react';

type CalendarEvent = {
  id: string;
  type: 'booking' | 'external' | 'group' | 'busy' | 'block';
  title: string;
  subtitle?: string | null;
  startsAt: string;
  endsAt: string;
  href?: string | null;
};

type ViewMode = 'agenda' | 'day' | 'week' | 'month';

const typeLabels: Record<CalendarEvent['type'], string> = {
  booking: 'Markedsplass',
  external: 'Ekstern avtale',
  group: 'Kurs/arrangement',
  busy: 'Google/Outlook',
  block: 'Blokkert',
};

function dateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' }).format(date);
}
function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(date);
}
function timeLabel(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' }).format(new Date(value));
}
function localMinutes(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Europe/Oslo' }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}
const DAY_START = 0;
const DAY_END = 24 * 60;
const HOUR_HEIGHT = 54;
function timelineStyle(event: CalendarEvent, day: Date) {
  const start = dateKey(new Date(event.startsAt)) < dateKey(day) ? DAY_START : localMinutes(event.startsAt);
  const rawEnd = dateKey(new Date(event.endsAt)) > dateKey(day) ? DAY_END : localMinutes(event.endsAt);
  const end = Math.min(DAY_END, Math.max(start + 30, rawEnd));
  return { top: `${((start - DAY_START) / 60) * HOUR_HEIGHT}px`, height: `${Math.max(28, ((end - start) / 60) * HOUR_HEIGHT)}px` };
}
function fullDateLabel(date: Date) {
  return new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(date);
}
function startOfLocalDay(date: Date) {
  const [y, m, d] = dateKey(date).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function startOfWeek(date: Date) {
  const base = startOfLocalDay(date);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Oslo' }).format(base);
  const index = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekday);
  return addDays(base, index === 0 ? -6 : 1 - index);
}
function startOfMonth(date: Date) {
  const key = dateKey(date);
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 12));
}
function eventsForDay(events: CalendarEvent[], date: Date) {
  const key = dateKey(date);
  return events.filter((event) => dateKey(new Date(event.startsAt)) <= key && dateKey(new Date(new Date(event.endsAt).getTime() - 1)) >= key).sort((a,b) => +new Date(a.startsAt) - +new Date(b.startsAt));
}

function EventChip({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const body = <>
    <span className="planner-event-time">{timeLabel(event.startsAt)}{compact ? '' : `–${timeLabel(event.endsAt)}`}</span>
    <strong>{event.title}</strong>
    {!compact && event.subtitle ? <small>{event.subtitle}</small> : null}
  </>;
  const className = `planner-event planner-${event.type}`;
  return event.href ? <a className={className} href={event.href}>{body}</a> : <div className={className}>{body}</div>;
}

export function TrainerCalendarBoard({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<ViewMode>('agenda');
  const [anchor, setAnchor] = useState(() => startOfLocalDay(new Date()));

  const rangeLabel = useMemo(() => {
    if (view === 'day') return fullDateLabel(anchor);
    if (view === 'month') return monthLabel(anchor);
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return `${dayLabel(start)} – ${dayLabel(end)}`;
  }, [view, anchor]);

  function move(direction: number) {
    if (view === 'day') setAnchor((d) => addDays(d, direction));
    else if ((view === 'week' || view === 'agenda')) setAnchor((d) => addDays(d, direction * 7));
    else {
      setAnchor((d) => {
        const key = dateKey(d);
        const [y,m] = key.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1 + direction, 1, 12));
      });
    }
  }

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const monthDays = useMemo(() => {
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [anchor]);

  return <section className="trainer-planner-calendar">
    <div className="planner-toolbar">
      <div className="planner-nav-buttons">
        <button className="btn secondary compact" type="button" aria-label="Forrige periode" onClick={() => move(-1)}>←</button>
        <button className="btn secondary compact" type="button" onClick={() => setAnchor(startOfLocalDay(new Date()))}>I dag</button>
        <button className="btn secondary compact" type="button" aria-label="Neste periode" onClick={() => move(1)}>→</button>
      </div>
      <h2>{rangeLabel}</h2>
      <div className="planner-view-toggle">
        {(['agenda','day','week','month'] as ViewMode[]).map((mode) => <button key={mode} className={view === mode ? 'active' : ''} aria-pressed={view === mode} type="button" onClick={() => setView(mode)}>{mode === 'agenda' ? 'Liste' : mode === 'day' ? 'Dag' : mode === 'week' ? 'Uke' : 'Måned'}</button>)}
      </div>
    </div>

    <div className="planner-legend">
      {(Object.keys(typeLabels) as CalendarEvent['type'][]).map((type) => <span key={type}><i className={`planner-dot planner-${type}`} />{typeLabels[type]}</span>)}
    </div>

    {view === 'agenda' ? <div className="trainer-agenda-days">{weekDays.map(day => { const items = eventsForDay(events, day); return <section className="trainer-agenda-day" key={dateKey(day)}><h3>{dayLabel(day)}</h3><div>{items.length ? items.map(event => <EventChip key={event.type + event.id} event={event} />) : <p className="muted small">Ingen avtaler</p>}</div></section>; })}</div> : null}
    {view === 'day' ? <div className="planner-time-shell planner-time-shell-day">
      <div className="planner-time-gutter planner-time-gutter-spacer" />
      <div className="planner-time-day-head"><strong>{dayLabel(anchor)}</strong></div>
      <div className="planner-time-gutter">{Array.from({ length: 25 }, (_, i) => <span key={i} style={{ top: `${i * HOUR_HEIGHT - 7}px` }}>{String(i).padStart(2,'0')}:00</span>)}</div>
      <div className="planner-time-column" style={{ height: `${24 * HOUR_HEIGHT}px` }}>{Array.from({length:25},(_,i)=><i className="planner-hour-line" key={i} style={{top:`${i*HOUR_HEIGHT}px`}} />)}{eventsForDay(events, anchor).map((event) => <div className="planner-timed-event-wrap" style={timelineStyle(event, anchor)} key={`${event.type}-${event.id}`}><EventChip event={event} /></div>)}</div>
    </div> : null}

    {view === 'week' ? <div className="planner-week-scroll"><div className="planner-time-shell planner-time-shell-week">
      <div className="planner-time-gutter planner-time-gutter-spacer" />
      {weekDays.map((day) => <div className={`planner-time-day-head ${dateKey(day)===dateKey(new Date())?'today':''}`} key={`head-${dateKey(day)}`}><strong>{dayLabel(day)}</strong></div>)}
      <div className="planner-time-gutter">{Array.from({ length: 25 }, (_, i) => <span key={i} style={{ top: `${i * HOUR_HEIGHT - 7}px` }}>{String(i).padStart(2,'0')}:00</span>)}</div>
      {weekDays.map((day) => <div className={`planner-time-column ${dateKey(day)===dateKey(new Date())?'today':''}`} style={{ height: `${24 * HOUR_HEIGHT}px` }} key={dateKey(day)}>{Array.from({length:25},(_,i)=><i className="planner-hour-line" key={i} style={{top:`${i*HOUR_HEIGHT}px`}} />)}{eventsForDay(events, day).map((event) => <div className="planner-timed-event-wrap" style={timelineStyle(event, day)} key={`${event.type}-${event.id}`}><EventChip event={event} compact /></div>)}</div>)}
    </div></div> : null}

    {view === 'month' ? <div className="planner-month-grid">
      {['Man','Tir','Ons','Tor','Fre','Lør','Søn'].map((label) => <div className="planner-month-weekday" key={label}>{label}</div>)}
      {monthDays.map((day) => {
        const dayEvents = eventsForDay(events, day);
        const inMonth = dateKey(day).slice(0,7) === dateKey(startOfMonth(anchor)).slice(0,7);
        const today = dateKey(day) === dateKey(new Date());
        return <button type="button" onClick={() => { setAnchor(day); setView('day'); }} className={`planner-month-day ${inMonth ? '' : 'outside'} ${today ? 'today' : ''}`} key={dateKey(day)}>
          <strong>{Number(dateKey(day).slice(-2))}</strong>
          <div>{dayEvents.slice(0,3).map((event) => <span className={`planner-month-chip planner-${event.type}`} key={`${event.type}-${event.id}`}>{timeLabel(event.startsAt)} {event.title}</span>)}</div>
          {dayEvents.length > 3 ? <small>+{dayEvents.length - 3} flere</small> : null}
        </button>;
      })}
    </div> : null}
  </section>;
}
