'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const days = [
  { weekday: 1, label: 'Mandag' },
  { weekday: 2, label: 'Tirsdag' },
  { weekday: 3, label: 'Onsdag' },
  { weekday: 4, label: 'Torsdag' },
  { weekday: 5, label: 'Fredag' },
  { weekday: 6, label: 'Lørdag' },
  { weekday: 0, label: 'Søndag' },
];

type DayState = { weekday: number; label: string; active: boolean; start: string; end: string };

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function TrainerOnboardingForm({ initialName = '' }: { initialName?: string }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initialName);
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [serviceTitle, setServiceTitle] = useState('Privattime');
  const [serviceDescription, setServiceDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(850);
  const [bookingMode, setBookingMode] = useState<'request' | 'instant'>('request');
  const [availability, setAvailability] = useState<DayState[]>(
    days.map((day) => ({ ...day, active: day.weekday >= 1 && day.weekday <= 5, start: '10:00', end: '16:00' }))
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const slug = useMemo(() => slugify(businessName), [businessName]);

  function updateDay(weekday: number, patch: Partial<DayState>) {
    setAvailability((current) => current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!slug) throw new Error('Skriv inn et navn på virksomheten.');
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Du må være logget inn.');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: businessName })
        .eq('id', user.id);
      if (profileError) throw profileError;

      const { error: trainerError } = await supabase
        .from('trainer_profiles')
        .upsert({
          id: user.id,
          slug,
          business_name: businessName,
          city,
          bio,
          specialties: specialties.split(',').map((item) => item.trim()).filter(Boolean),
        }, { onConflict: 'id' });
      if (trainerError) {
        if (trainerError.code === '23505') throw new Error('Dette profilnavnet er allerede i bruk. Prøv et litt annet navn.');
        throw trainerError;
      }

      const { data: service, error: serviceError } = await supabase
        .from('services')
        .insert({
          trainer_id: user.id,
          title: serviceTitle,
          description: serviceDescription,
          duration_minutes: duration,
          price_nok: price,
          booking_mode: bookingMode,
        })
        .select('id')
        .single();
      if (serviceError) throw serviceError;

      const rows = availability
        .filter((day) => day.active)
        .map((day) => ({
          trainer_id: user.id,
          service_id: service.id,
          weekday: day.weekday,
          start_time: day.start,
          end_time: day.end,
          timezone: 'Europe/Oslo',
        }));

      if (rows.length) {
        const { error: availabilityError } = await supabase.from('weekly_availability').insert(rows);
        if (availabilityError) throw availabilityError;
      }

      const { error: generateError } = await supabase.rpc('regenerate_service_slots', {
        p_service_id: service.id,
        p_days: 60,
      });
      if (generateError) throw generateError;

      router.push('/trainer-dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre trenerprofilen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <section className="onboarding-card">
        <span className="step-number">1</span>
        <div className="step-copy">
          <span className="eyebrow">Profil</span>
          <h2>Fortell hundeeiere hvem du er</h2>
          <div className="form-grid">
            <label>Navn på trener eller virksomhet<input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required /></label>
            <label>Sted<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hamar" required /></label>
            <label className="full">Kort beskrivelse<textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Hvordan trener du, og hvem hjelper du?" required /></label>
            <label className="full">Spesialiteter, separert med komma<input value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="Valp, passeringstrening, innkalling" /></label>
          </div>
          <p className="muted tiny">Profiladresse: /trainers/{slug || 'ditt-navn'}</p>
        </div>
      </section>

      <section className="onboarding-card">
        <span className="step-number">2</span>
        <div className="step-copy">
          <span className="eyebrow">Første tjeneste</span>
          <h2>Hva kan kunder bestille?</h2>
          <div className="form-grid">
            <label>Tjeneste<input value={serviceTitle} onChange={(e) => setServiceTitle(e.target.value)} required /></label>
            <label>Varighet<select value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>120 min</option></select></label>
            <label className="full">Beskrivelse<textarea rows={3} value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="Hva er inkludert i timen?" required /></label>
            <label>Pris i kroner<input type="number" min="0" step="10" value={price} onChange={(e) => setPrice(Number(e.target.value))} required /></label>
            <label>Bestillingstype<select value={bookingMode} onChange={(e) => setBookingMode(e.target.value as 'request' | 'instant')}><option value="request">Treneren må bekrefte</option><option value="instant">Direktebestilling</option></select></label>
          </div>
        </div>
      </section>

      <section className="onboarding-card">
        <span className="step-number">3</span>
        <div className="step-copy">
          <span className="eyebrow">Tilgjengelighet</span>
          <h2>Når kan tjenesten bestilles?</h2>
          <p className="muted small">Dette er faste ukentlige tider. Enkeltdager og ferie legger vi til i kalenderen senere.</p>
          <div className="availability-editor">
            {availability.map((day) => (
              <div className="availability-row" key={day.weekday}>
                <label className="day-toggle"><input type="checkbox" checked={day.active} onChange={(e) => updateDay(day.weekday, { active: e.target.checked })} /><strong>{day.label}</strong></label>
                <input type="time" value={day.start} disabled={!day.active} onChange={(e) => updateDay(day.weekday, { start: e.target.value })} />
                <span>til</span>
                <input type="time" value={day.end} disabled={!day.active} onChange={(e) => updateDay(day.weekday, { end: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {error ? <p className="form-error form-error-block">{error}</p> : null}
      <div className="onboarding-submit"><button className="btn" type="submit" disabled={loading}>{loading ? 'Lagrer…' : 'Opprett trenerprofil'}</button></div>
    </form>
  );
}
