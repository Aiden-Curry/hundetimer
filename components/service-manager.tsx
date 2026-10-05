'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Service = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  price_nok: number;
  booking_mode: 'request' | 'instant';
  delivery_mode: 'in_person' | 'online' | 'both';
  slot_interval_minutes: number;
  active: boolean;
};

type Draft = Omit<Service, 'id'> & { id?: string };

const blank: Draft = {
  title: 'Privattime',
  description: '',
  duration_minutes: 60,
  price_nok: 850,
  booking_mode: 'request',
  delivery_mode: 'in_person',
  slot_interval_minutes: 30,
  active: true,
};

function money(value: number) {
  return new Intl.NumberFormat('nb-NO').format(value) + ' kr';
}

export function ServiceManager({ initialServices }: { initialServices: Service[] }) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [draft, setDraft] = useState<Draft>({ ...blank });
  const [editorOpen, setEditorOpen] = useState(!initialServices.length);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function edit(service: Service) {
    setEditorOpen(true);
    setEditingId(service.id);
    setDraft({ ...service });
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    setEditingId(null);
    setDraft({ ...blank });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      if (!draft.title.trim()) throw new Error('Tjenesten må ha et navn.');
      if (draft.duration_minutes < 15) throw new Error('Varigheten må være minst 15 minutter.');
      if (draft.price_nok < 0) throw new Error('Prisen kan ikke være negativ.');

      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Du må være logget inn.');

      const payload = {
        trainer_id: user.id,
        title: draft.title.trim(),
        description: draft.description?.trim() || null,
        duration_minutes: draft.duration_minutes,
        price_nok: draft.price_nok,
        booking_mode: draft.booking_mode,
        delivery_mode: draft.delivery_mode,
        slot_interval_minutes: draft.slot_interval_minutes,
        active: draft.active,
        updated_at: new Date().toISOString(),
      };

      let saved: Service;
      if (editingId) {
        const { data, error: updateError } = await supabase.from('services').update(payload).eq('id', editingId).eq('trainer_id', user.id).select('id, title, description, duration_minutes, price_nok, booking_mode, delivery_mode, slot_interval_minutes, active').single();
        if (updateError) throw updateError;
        saved = data as Service;
      } else {
        const { data, error: insertError } = await supabase.from('services').insert(payload).select('id, title, description, duration_minutes, price_nok, booking_mode, delivery_mode, slot_interval_minutes, active').single();
        if (insertError) throw insertError;
        saved = data as Service;
      }

      if (saved.active) {
        const { error: regenerateError } = await supabase.rpc('regenerate_service_slots', { p_service_id: saved.id, p_days: 60 });
        if (regenerateError) throw regenerateError;
      } else {
        const { error: clearError } = await supabase.from('availability_slots').delete().eq('service_id', saved.id).eq('trainer_id', user.id).eq('status', 'open');
        if (clearError) throw clearError;
      }

      setServices((current) => editingId ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setMessage(editingId ? 'Tjenesten er oppdatert.' : 'Tjenesten er opprettet. Velg Tilgjengelighet i menyen for å legge til tider.');
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre tjenesten.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(service: Service) {
    setError('');
    setMessage('');
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Du må være logget inn.');
      const nextActive = !service.active;
      const { error: updateError } = await supabase.from('services').update({ active: nextActive, updated_at: new Date().toISOString() }).eq('id', service.id).eq('trainer_id', user.id);
      if (updateError) throw updateError;
      if (nextActive) {
        const { error: regenerateError } = await supabase.rpc('regenerate_service_slots', { p_service_id: service.id, p_days: 60 });
        if (regenerateError) throw regenerateError;
      } else {
        const { error: clearError } = await supabase.from('availability_slots').delete().eq('service_id', service.id).eq('trainer_id', user.id).eq('status', 'open');
        if (clearError) throw clearError;
      }
      setServices((current) => current.map((item) => item.id === service.id ? { ...item, active: nextActive } : item));
      setMessage(nextActive ? 'Tjenesten er aktivert.' : 'Tjenesten er skjult fra kunder.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke oppdatere tjenesten.');
    }
  }

  return (
    <div className="service-manager-layout">
      <details className="workspace-disclosure service-disclosure" open={editorOpen} onToggle={e => setEditorOpen(e.currentTarget.open)}><summary>{editingId ? 'Rediger tjeneste' : '+ Opprett tjeneste'}</summary>
      <form className="editor-card service-editor-form" onSubmit={save}>
        <div className="section-title"><div><span className="eyebrow">{editingId ? 'Rediger tjeneste' : 'Ny tjeneste'}</span><h2>{editingId ? 'Oppdater tilbudet' : 'Hva kan kunden bestille?'}</h2></div>{editingId ? <button className="text-button" type="button" onClick={reset}>Avbryt redigering</button> : null}</div>
        <div className="form-grid editor-form-grid">
          <label>Tjenestenavn<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required /></label>
          <label>Pris i kroner<input type="number" min="0" step="10" value={draft.price_nok} onChange={(e) => setDraft({ ...draft, price_nok: Number(e.target.value) })} required /></label>
          <label className="full">Beskrivelse<textarea rows={4} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Hva får kunden, og hvem passer denne tjenesten for?" /></label>
          <label>Varighet<select value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={75}>75 min</option><option value={90}>90 min</option><option value={120}>120 min</option></select></label>
          <label>Starttider hvert<select value={draft.slot_interval_minutes} onChange={(e) => setDraft({ ...draft, slot_interval_minutes: Number(e.target.value) })}><option value={15}>15. minutt</option><option value={30}>30. minutt</option><option value={45}>45. minutt</option><option value={60}>60. minutt</option></select></label>
          <label>Bestillingstype<select value={draft.booking_mode} onChange={(e) => setDraft({ ...draft, booking_mode: e.target.value as 'request' | 'instant' })}><option value="request">Treneren må bekrefte</option><option value="instant">Direktebestilling</option></select></label>
          <label>Hvor tilbys tjenesten?<select value={draft.delivery_mode} onChange={(e) => setDraft({ ...draft, delivery_mode: e.target.value as 'in_person' | 'online' | 'both' })}><option value="in_person">Fysisk oppmøte</option><option value="online">På nett</option><option value="both">Både fysisk og på nett</option></select></label>
          <label className="checkbox-label service-active-checkbox"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Synlig og bestillbar</label>
        </div>
        <div className="editor-actions"><button className="btn" disabled={loading} type="submit">{loading ? 'Lagrer…' : editingId ? 'Lagre endringer' : 'Opprett tjeneste'}</button></div>
      </form></details>

      {message ? <p role="status" className="form-success">{message}</p> : null}
      {error ? <p role="alert" className="form-error form-error-block">{error}</p> : null}

      <section className="dashboard-section service-management-list">
        <div className="section-title"><div><span className="eyebrow">Dine tjenester</span><h2>{services.length} {services.length === 1 ? 'tjeneste' : 'tjenester'}</h2></div></div>
        <div className="service-admin-grid">
          {services.length ? services.map((service) => (
            <article className={`service-admin-card ${service.active ? '' : 'inactive'}`} key={service.id}>
              <div className="service-admin-heading"><div><span className={`status ${service.active ? 'confirmed' : 'expired'}`}>{service.active ? 'Aktiv' : 'Skjult'}</span><h3>{service.title}</h3></div><strong>{money(service.price_nok)}</strong></div>
              {service.description ? <p className="muted">{service.description}</p> : <p className="muted">Ingen beskrivelse ennå.</p>}
              <div className="service-admin-meta"><span>{service.duration_minutes} min</span><span>Start hvert {service.slot_interval_minutes}. min</span><span>{service.booking_mode === 'instant' ? 'Direktebestilling' : 'Må bekreftes'}</span><span>{service.delivery_mode === 'online' ? 'På nett' : service.delivery_mode === 'both' ? 'Fysisk + på nett' : 'Fysisk'}</span></div>
              <div className="service-admin-actions"><button className="btn secondary compact" type="button" onClick={() => edit(service)}>Rediger</button><button className="text-button" type="button" onClick={() => toggleActive(service)}>{service.active ? 'Skjul tjeneste' : 'Aktiver tjeneste'}</button></div>
            </article>
          )) : <div className="empty-state"><h3>Ingen tjenester ennå</h3><p className="muted">Opprett den første tjenesten over.</p></div>}
        </div>
      </section>
    </div>
  );
}
