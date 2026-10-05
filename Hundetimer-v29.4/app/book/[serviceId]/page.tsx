import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { findService } from '@/lib/mock-data';
import { requestBookingAction } from '../actions';
import { previewPromotion } from '@/lib/promotions/server';

function formatSlot(value: string, long = false) {
  return new Intl.DateTimeFormat('nb-NO', long ? {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  } : {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}

function dogMeta(dog: { breed: string | null; birth_date: string | null }) {
  const parts: string[] = [];
  if (dog.breed) parts.push(dog.breed);
  if (dog.birth_date) {
    const birth = new Date(`${dog.birth_date}T12:00:00`);
    const now = new Date();
    let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
    if (now.getDate() < birth.getDate()) months -= 1;
    if (months >= 0) parts.push(months < 24 ? `${months} mnd` : `${Math.floor(months / 12)} år`);
  }
  return parts.join(' · ');
}

export default async function BookingPage({ params, searchParams }: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ slot?: string; error?: string; payment?: string; promo?: string }>;
}) {
  const { serviceId } = await params;
  const { slot: slotId, error, payment, promo } = await searchParams;

  if (!isSupabaseConfigured()) {
    const result = findService(serviceId);
    if (!result) { notFound(); throw new Error('Fant ikke tjenesten.'); }
    const { trainer, service } = result;
    const selectedSlot = service.slots[0];
    return <main className="page-shell checkout-shell"><section className="checkout-card"><span className="eyebrow">Demobestilling</span><h1>{service.title}</h1><p className="lead"><strong>{formatSlot(selectedSlot, true)}</strong></p><p className="muted">med {trainer.name}</p></section></main>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: service } = await supabase.from('services').select('id, trainer_id, title, description, duration_minutes, price_nok, booking_mode, active').eq('id', serviceId).eq('active', true).maybeSingle();
  if (!service) notFound();

  const [{ data: trainer }, { data: slots }, dogsResult] = await Promise.all([
    supabase.from('trainer_profiles').select('slug, business_name, city').eq('id', service.trainer_id).maybeSingle(),
    supabase.from('availability_slots').select('id, starts_at, ends_at').eq('service_id', service.id).eq('status', 'open').gt('starts_at', new Date().toISOString()).order('starts_at').limit(60),
    user ? supabase.from('dogs').select('id, name, breed, birth_date').eq('owner_id', user.id).order('created_at') : Promise.resolve({ data: [] as { id: string; name: string; breed: string | null; birth_date: string | null }[] }),
  ]);
  const dogs = dogsResult.data || [];
  if (!trainer) { notFound(); throw new Error('Fant ikke hundetreneren.'); }

  const selectedSlot = (slots || []).find((item) => item.id === slotId) || (!slotId ? (slots || [])[0] : undefined);
  const serviceFee = 29;
  const promotion = promo ? await previewPromotion(supabase, 'booking', service.id, promo) : null;
  const discount = promotion?.discount_nok || 0;
  const discountedSubtotal = promotion?.discounted_subtotal_nok ?? service.price_nok;
  const total = discountedSubtotal + serviceFee;
  const returnPath = selectedSlot ? `/book/${service.id}?slot=${selectedSlot.id}${promo ? `&promo=${encodeURIComponent(promo)}` : ''}` : `/book/${service.id}${promo ? `?promo=${encodeURIComponent(promo)}` : ''}`;
  const addDogHref = `/account/dogs?next=${encodeURIComponent(returnPath)}`;

  return (
    <main className="page-shell checkout-shell">
      <div>
        <Link className="text-link" href={`/trainers/${trainer.slug}`}>← Tilbake til {trainer.business_name}</Link>
        <section className="checkout-card">
          <span className="eyebrow">Velg tidspunkt</span>
          <h1>{service.title}</h1>
          <p className="muted">{service.duration_minutes} minutter med {trainer.business_name}</p>

          {(slots || []).length ? <div className="booking-slot-picker">{(slots || []).map((item) => (
            <Link key={item.id} className={`slot open ${selectedSlot?.id === item.id ? 'selected' : ''}`} href={`/book/${service.id}?slot=${item.id}${promo ? `&promo=${encodeURIComponent(promo)}` : ''}`}>{formatSlot(item.starts_at)}</Link>
          ))}</div> : <div className="empty-state compact-empty"><h3>Ingen ledige tider akkurat nå</h3><p className="muted">Gå tilbake til trenerprofilen eller sjekk igjen senere.</p></div>}

          {slotId && !selectedSlot ? <p className="form-error form-error-block">Denne tiden er ikke lenger ledig. Velg en annen tid.</p> : null}
          {error ? <p className="form-error form-error-block">{error}</p> : null}
          {payment === 'cancelled' ? <p className="form-error form-error-block">Betalingen ble avbrutt. Tidspunktet er frigitt igjen.</p> : null}

          {selectedSlot ? <>
            <div className="selected-time-card"><span className="eyebrow">Valgt tid</span><strong>{formatSlot(selectedSlot.starts_at, true)}</strong></div>
            {!user ? <div className="booking-login-box"><h3>Logg inn for å bestille</h3><p className="muted">Du sendes til sikker betaling hos Stripe etterpå.</p><div className="booking-actions-inline"><Link className="btn" href={`/login?next=${encodeURIComponent(returnPath)}`}>Logg inn</Link><Link className="btn secondary" href={`/register?next=${encodeURIComponent(returnPath)}`}>Opprett konto</Link></div></div> : !dogs.length ? <div className="booking-login-box"><h3>Legg til hunden først</h3><p className="muted">Vi lagrer hundeprofilen så du slipper å skrive inn de samme opplysningene ved hver bestilling.</p><div className="booking-actions-inline"><Link className="btn" href={addDogHref}>Legg til hund</Link><Link className="text-link" href="/account">Min side</Link></div></div> : <form action={requestBookingAction} className="booking-request-form">
              <input type="hidden" name="serviceId" value={service.id} /><input type="hidden" name="slotId" value={selectedSlot.id} /><input type="hidden" name="promoCode" value={promotion?.code || ''} />
              <div className="form-grid">
                <label>Hvilken hund gjelder timen?<select name="dogId" required defaultValue={dogs[0]?.id || ''}>{dogs.map((dog) => <option key={dog.id} value={dog.id}>{dog.name}{dogMeta(dog) ? ` · ${dogMeta(dog)}` : ''}</option>)}</select></label>
                <div className="booking-dog-manage"><span className="muted small">{dogs.length} {dogs.length === 1 ? 'hund' : 'hunder'} lagret</span><Link className="text-link" href={addDogHref}>Legg til eller rediger hund</Link></div>
                <label className="full">Hva ønsker du hjelp med?<textarea name="note" maxLength={1500} rows={5} placeholder="Fortell kort om hva du ønsker hjelp med på denne timen." /></label>
              </div>
              <div className="notice">{service.booking_mode === 'request' ? 'Kortet autoriseres hos Stripe. Beløpet trekkes først når treneren bekrefter timen. Treneren kan også foreslå en annen tid eller avslå.' : 'Denne tjenesten har direktebestilling. Betalingen fullføres og tidspunktet bekreftes automatisk etter betaling.'}</div>
              <button className="btn wide" type="submit">Gå til sikker betaling</button>
            </form>}
          </> : null}
        </section>
      </div>

      <aside className="summary-card"><h3>Bestillingsoversikt</h3><div className="summary-line"><span>{service.title}</span><strong>{service.price_nok} kr</strong></div>{promotion ? <div className="summary-line discount-line"><span>Rabatt · {promotion.code}</span><strong>-{discount} kr</strong></div> : null}<div className="summary-line"><span>Servicegebyr</span><strong>{serviceFee} kr</strong></div><div className="summary-total"><span>Totalt</span><strong>{total} kr</strong></div><form method="get" className="promo-apply-form">{selectedSlot?<input type="hidden" name="slot" value={selectedSlot.id}/>:null}<label>Rabattkode<input name="promo" defaultValue={promo || ''} placeholder="Skriv inn kode" /></label><button className="btn secondary compact" type="submit">Bruk kode</button></form>{promo && !promotion ? <p className="form-error small">Rabattkoden er ugyldig, utløpt eller kan ikke brukes på denne tjenesten.</p> : null}{promotion ? <p className="form-success small">{promotion.promotion_name}: du sparer {discount} kr.</p> : null}{selectedSlot ? <p className="muted small">{formatSlot(selectedSlot.starts_at, true)}</p> : null}<p className="muted small">Kortopplysninger håndteres av Stripe. Ved forespørselsbestilling reserveres beløpet først og trekkes når treneren bekrefter.</p></aside>
    </main>
  );
}
