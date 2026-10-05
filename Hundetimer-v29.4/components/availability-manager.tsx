'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Service = {
  id: string;
  title: string;
  duration_minutes: number;
};

type Rule = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  service_id: string | null;
};

type Block = {
  id: string;
  service_id: string | null;
  starts_at: string;
  ends_at: string;
  note: string | null;
};

type Slot = {
  id: string;
  service_id: string | null;
  starts_at: string;
  ends_at: string;
};

type DaySetting = {
  weekday: number;
  label: string;
  active: boolean;
  start: string;
  end: string;
};

const baseDays: DaySetting[] = [
  { weekday: 1, label: 'Mandag', active: false, start: '09:00', end: '16:00' },
  { weekday: 2, label: 'Tirsdag', active: false, start: '09:00', end: '16:00' },
  { weekday: 3, label: 'Onsdag', active: false, start: '09:00', end: '16:00' },
  { weekday: 4, label: 'Torsdag', active: false, start: '09:00', end: '16:00' },
  { weekday: 5, label: 'Fredag', active: false, start: '09:00', end: '16:00' },
  { weekday: 6, label: 'Lørdag', active: false, start: '10:00', end: '14:00' },
  { weekday: 0, label: 'Søndag', active: false, start: '10:00', end: '14:00' },
];

function rulesForService(rules: Rule[], serviceId: string) {
  return baseDays.map((day) => {
    const row = rules.find((rule) => rule.service_id === serviceId && rule.weekday === day.weekday);
    return row
      ? { ...day, active: true, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) }
      : { ...day };
  });
}

function formatSlot(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}

function formatBlockRange(block: Block) {
  const dateFormatter = new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  });
  const timeFormatter = new Intl.DateTimeFormat('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Oslo',
  });
  const dateKeyFormatter = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Oslo',
  });
  const start = new Date(block.starts_at);
  const end = new Date(block.ends_at);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);
  const isFullDay = startTime === '00:00' && endTime === '00:00' && dateKeyFormatter.format(start) !== dateKeyFormatter.format(end);
  return isFullDay ? `${dateFormatter.format(start)} · hele dagen` : `${dateFormatter.format(start)} · ${startTime}–${endTime}`;
}

export function AvailabilityManager({
  services,
  initialRules,
  initialBlocks,
  initialSlots,
}: {
  services: Service[];
  initialRules: Rule[];
  initialBlocks: Block[];
  initialSlots: Slot[];
}) {
  const router = useRouter();
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id || '');
  const [daysByService, setDaysByService] = useState<Record<string, DaySetting[]>>(() =>
    Object.fromEntries(services.map((service) => [service.id, rulesForService(initialRules, service.id)]))
  );
  const [blocks, setBlocks] = useState(initialBlocks);
  const [slots, setSlots] = useState(initialSlots);
  const [blockDate, setBlockDate] = useState('');
  const [blockAllDay, setBlockAllDay] = useState(false);
  const [blockStart, setBlockStart] = useState('13:00');
  const [blockEnd, setBlockEnd] = useState('14:00');
  const [blockScope, setBlockScope] = useState<'all' | 'service'>('all');
  const [blockNote, setBlockNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedService = services.find((service) => service.id === selectedServiceId);
  const days = daysByService[selectedServiceId] || baseDays;

  const selectedBlocks = useMemo(
    () => blocks.filter((block) => (block.service_id === null || block.service_id === selectedServiceId) && new Date(block.ends_at) >= new Date()),
    [blocks, selectedServiceId]
  );

  const selectedSlots = useMemo(
    () => slots.filter((slot) => slot.service_id === selectedServiceId && new Date(slot.starts_at) > new Date()).slice(0, 16),
    [slots, selectedServiceId]
  );

  function updateDay(weekday: number, patch: Partial<DaySetting>) {
    setDaysByService((current) => ({
      ...current,
      [selectedServiceId]: (current[selectedServiceId] || baseDays).map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day
      ),
    }));
  }

  async function refreshServiceData(serviceId: string) {
    const supabase = createClient();
    const [{ data: newSlots }, { data: newBlocks }] = await Promise.all([
      supabase
        .from('availability_slots')
        .select('id, service_id, starts_at, ends_at')
        .eq('service_id', serviceId)
        .eq('status', 'open')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(80),
      supabase
        .from('availability_exceptions')
        .select('id, service_id, starts_at, ends_at, note')
        .eq('kind', 'blocked')
        .gte('ends_at', new Date().toISOString())
        .order('starts_at'),
    ]);

    if (newSlots) {
      setSlots((current) => [...current.filter((slot) => slot.service_id !== serviceId), ...newSlots]);
    }
    if (newBlocks) {
      setBlocks(newBlocks);
    }
  }

  async function regenerate(serviceId: string) {
    const supabase = createClient();
    const { error: generateError } = await supabase.rpc('regenerate_service_slots', {
      p_service_id: serviceId,
      p_days: 60,
    });
    if (generateError) throw generateError;
    await refreshServiceData(serviceId);
  }

  async function saveWeeklyHours() {
    if (!selectedServiceId) return;
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Du må være logget inn.');

      for (const day of days) {
        if (day.active && day.end <= day.start) {
          throw new Error(`${day.label}: sluttiden må være etter starttiden.`);
        }
      }

      const { error: deleteError } = await supabase
        .from('weekly_availability')
        .delete()
        .eq('trainer_id', user.id)
        .eq('service_id', selectedServiceId);
      if (deleteError) throw deleteError;

      const rows = days.filter((day) => day.active).map((day) => ({
        trainer_id: user.id,
        service_id: selectedServiceId,
        weekday: day.weekday,
        start_time: day.start,
        end_time: day.end,
        timezone: 'Europe/Oslo',
        active: true,
      }));

      if (rows.length) {
        const { error: insertError } = await supabase.from('weekly_availability').insert(rows);
        if (insertError) throw insertError;
      }

      await regenerate(selectedServiceId);
      setMessage('Tilgjengeligheten er lagret, og nye ledige tider er generert for de neste 60 dagene.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre tilgjengeligheten.');
    } finally {
      setSaving(false);
    }
  }

  async function regenerateAffected(serviceId: string | null) {
    if (serviceId) {
      await regenerate(serviceId);
      return;
    }
    for (const service of services) {
      await regenerate(service.id);
    }
  }

  async function addBlockedPeriod() {
    if (!selectedServiceId || !blockDate) return;
    setSaving(true);
    setMessage('');
    setError('');

    try {
      if (!blockAllDay && blockEnd <= blockStart) {
        throw new Error('Sluttiden må være etter starttiden.');
      }
      const supabase = createClient();
      const serviceId = blockScope === 'all' ? null : selectedServiceId;
      const { error: blockError } = await supabase.rpc('block_trainer_period', {
        p_service_id: serviceId,
        p_date: blockDate,
        p_start_time: blockAllDay ? null : blockStart,
        p_end_time: blockAllDay ? null : blockEnd,
        p_note: blockNote || null,
      });
      if (blockError) throw blockError;

      await regenerateAffected(serviceId);
      setBlockDate('');
      setBlockNote('');
      setMessage(blockAllDay ? 'Dagen er blokkert og ledige tider er oppdatert.' : 'Tidsrommet er blokkert og ledige tider er oppdatert.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke blokkere tidsrommet.');
    } finally {
      setSaving(false);
    }
  }

  async function removeBlock(blockId: string) {
    if (!selectedServiceId) return;
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const supabase = createClient();
      const block = blocks.find((row) => row.id === blockId);
      const { error: deleteError } = await supabase.from('availability_exceptions').delete().eq('id', blockId);
      if (deleteError) throw deleteError;
      await regenerateAffected(block?.service_id ?? null);
      setMessage('Blokkeringen er fjernet og ledige tider er oppdatert.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke fjerne blokkeringen.');
    } finally {
      setSaving(false);
    }
  }

  if (!services.length) {
    return <div className="empty-state compact-empty"><h3>Legg til en tjeneste først</h3><p className="muted">Tilgjengelighet knyttes til en bestemt tjeneste og varigheten på den.</p></div>;
  }

  return (
    <div className="availability-manager">
      <div className="availability-toolbar">
        <label>
          <span>Tjeneste</span>
          <select value={selectedServiceId} onChange={(e) => setSelectedServiceId(e.target.value)}>
            {services.map((service) => <option value={service.id} key={service.id}>{service.title} ({service.duration_minutes} min)</option>)}
          </select>
        </label>
        <div className="availability-help">
          <strong>30 minutters startintervall</strong>
          <span className="muted small">En {selectedService?.duration_minutes || 0}-minutters time vises bare når hele timen får plass.</span>
        </div>
      </div>

      <div className="availability-workspace">
        <section className="availability-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Ukentlig</span><h3>Faste åpningstider</h3></div>
          </div>
          <div className="availability-editor dashboard-editor">
            {days.map((day) => (
              <div className="availability-row" key={day.weekday}>
                <label className="day-toggle">
                  <input type="checkbox" checked={day.active} onChange={(e) => updateDay(day.weekday, { active: e.target.checked })} />
                  <strong>{day.label}</strong>
                </label>
                <input type="time" value={day.start} disabled={!day.active} onChange={(e) => updateDay(day.weekday, { start: e.target.value })} />
                <span>til</span>
                <input type="time" value={day.end} disabled={!day.active} onChange={(e) => updateDay(day.weekday, { end: e.target.value })} />
              </div>
            ))}
          </div>
          <button className="btn" type="button" disabled={saving} onClick={saveWeeklyHours}>{saving ? 'Lagrer…' : 'Lagre og generer tider'}</button>
        </section>

        <section className="availability-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Unntak</span><h3>Blokker tid</h3></div>
          </div>
          <p className="muted small">Bruk dette for avtaler utenfor plattformen, pauser, ferie eller andre tidspunkt du ikke vil kunne bookes.</p>
          <div className="block-day-form">
            <label>Dato<input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} /></label>
            <label className="inline-check"><input type="checkbox" checked={blockAllDay} onChange={(e) => setBlockAllDay(e.target.checked)} />Hele dagen</label>
            {!blockAllDay ? <div className="block-time-row">
              <label>Fra<input type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} /></label>
              <label>Til<input type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} /></label>
            </div> : null}
            <label>Gjelder<select value={blockScope} onChange={(e) => setBlockScope(e.target.value as 'all' | 'service')}>
              <option value="all">Alle tjenester</option>
              <option value="service">Bare {selectedService?.title || 'valgt tjeneste'}</option>
            </select></label>
            <label>Notat, valgfritt<input value={blockNote} onChange={(e) => setBlockNote(e.target.value)} placeholder="Privat avtale" /></label>
            <button className="btn secondary" type="button" disabled={saving || !blockDate} onClick={addBlockedPeriod}>{blockAllDay ? 'Blokker dagen' : 'Blokker tidsrommet'}</button>
          </div>
          <div className="blocked-days">
            {selectedBlocks.length ? selectedBlocks.map((block) => (
              <div className="blocked-day" key={block.id}>
                <div>
                  <strong>{formatBlockRange(block)}</strong>
                  <span className="muted small">{block.service_id ? `Bare ${services.find((service) => service.id === block.service_id)?.title || 'valgt tjeneste'}` : 'Alle tjenester'}</span>
                  {block.note ? <span className="muted small">{block.note}</span> : null}
                </div>
                <button type="button" className="text-button" disabled={saving} onClick={() => removeBlock(block.id)}>Fjern</button>
              </div>
            )) : <p className="muted small">Ingen kommende blokkerte tidsrom.</p>}
          </div>
        </section>
      </div>

      <section className="slot-preview-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Forhåndsvisning</span><h3>Neste ledige tider</h3></div>
          <button className="btn secondary compact" type="button" disabled={saving} onClick={() => regenerate(selectedServiceId)}>Oppdater tider</button>
        </div>
        {selectedSlots.length ? (
          <div className="slot-preview-grid">
            {selectedSlots.map((slot) => <span className="slot open" key={slot.id}>{formatSlot(slot.starts_at)}</span>)}
          </div>
        ) : <div className="empty-state compact-empty"><h3>Ingen genererte tider ennå</h3><p className="muted">Lagre uketidene for å generere bookbare tider.</p></div>}
      </section>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error form-error-block">{error}</p> : null}
    </div>
  );
}
