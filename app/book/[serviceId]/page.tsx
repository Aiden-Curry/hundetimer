import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Dog, MapPin, ShieldCheck, Video } from 'lucide-react';
import { PrivateLessonTimes } from '@/components/private-lesson-times';
import { DiscoveryImage } from '@/components/discovery-controls';
import './booking.css';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { findService } from '@/lib/mock-data';
import { requestBookingAction } from '../actions';
import { previewPromotion } from '@/lib/promotions/server';
import { InlinePaymentForm } from '@/components/inline-payment-form';

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

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }

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
  const { data: service } = await supabase.from('services').select('id, trainer_id, title, description, duration_minutes, price_nok, booking_mode, delivery_mode, active').eq('id', serviceId).eq('active', true).maybeSingle();
  if (!service) notFound();

  const [{ data: trainer }, { data: slots, error: slotsError }, dogsResult] = await Promise.all([
    supabase.from('trainer_profiles').select('slug, business_name, city, profile_image_url, verified').eq('id', service.trainer_id).maybeSingle(),
    supabase.from('availability_slots').select('id, starts_at, ends_at').eq('service_id', service.id).eq('status', 'open').gt('starts_at', new Date().toISOString()).order('starts_at').limit(60),
    user ? supabase.from('dogs').select('id, name, breed, birth_date').eq('owner_id', user.id).order('created_at') : Promise.resolve({ data: [] as { id: string; name: string; breed: string | null; birth_date: string | null }[], error: null }),
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

  const isRequest = service.booking_mode === 'request';
  const modeLabel = service.delivery_mode === 'online' ? 'På nett' : service.delivery_mode === 'both' ? 'Fysisk eller på nett' : 'Fysisk oppmøte';
  const bookingExplanation = isRequest ? 'Beløpet reserveres på kortet og trekkes først når treneren bekrefter timen. Treneren kan også foreslå en annen tid eller avslå.' : 'Timen bekreftes automatisk når betalingen er gjennomført.';

  return <main className="page-shell private-booking-page">
    <Link className="pb-back" href={`/trainers/${trainer.slug}`}><ArrowLeft size={16} aria-hidden="true" />Tilbake til {trainer.business_name}</Link>
    <header className="pb-heading"><h1>{service.title}</h1><div className="pb-service-meta"><span><Clock3 size={16} aria-hidden="true" />{service.duration_minutes} minutter</span><span>{service.delivery_mode === 'online' ? <Video size={16} aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}{modeLabel}</span><span className="pb-mode">{isRequest ? 'Treneren bekrefter' : 'Direktebestilling'}</span></div>{service.description && <p>{service.description}</p>}</header>
    {error && <p className="pb-error" role="alert">{error}</p>}
    {payment === 'cancelled' && <p className="pb-error" role="alert">Betalingen ble avbrutt. Velg en ledig tid for å prøve igjen.</p>}
    <div className="pb-layout">
      <section className="pb-panel pb-availability" aria-labelledby="pb-time-title"><div className="pb-panel-heading"><span className="pb-step" aria-hidden="true">1</span><div><h2 id="pb-time-title">Velg tidspunkt</h2><p>Finn en dato og tid som passer deg.</p></div></div>
        {slotsError ? <div className="pb-empty" role="status"><CalendarDays size={24} aria-hidden="true" /><h3>Kunne ikke hente ledige tider</h3><p>Prøv å laste siden på nytt om litt.</p><Link href={returnPath} className="btn secondary">Prøv igjen</Link></div> : slots?.length ? <><PrivateLessonTimes key={`${selectedSlot?.id || 'none'}:${promo || ''}`} slots={slots} selectedId={selectedSlot?.id} serviceId={service.id} promo={promo} />{slotId && !selectedSlot && <p className="pb-error" role="alert">Denne tiden er ikke lenger ledig. Velg et annet klokkeslett.</p>}</> : <div className="pb-empty"><CalendarDays size={24} aria-hidden="true" /><h3>Ingen ledige tider akkurat nå</h3><p>Treneren har ikke publisert flere ledige tider for denne tjenesten.</p><Link className="btn secondary" href={`/trainers/${trainer.slug}`}>Se trenerens andre tilbud</Link></div>}
      </section>

      <aside className="pb-summary" aria-label="Bestillingsoversikt"><h2>Din bestilling</h2><Link className="pb-trainer" href={`/trainers/${trainer.slug}`}><span className="pb-avatar" aria-hidden="true">{trainer.profile_image_url ? <DiscoveryImage key={trainer.profile_image_url} src={trainer.profile_image_url} fallback={<span>{trainer.business_name.slice(0, 1)}</span>} /> : <span>{trainer.business_name.slice(0, 1)}</span>}</span><span><strong>{trainer.business_name}</strong><small>{trainer.city}{trainer.verified && <ShieldCheck size={14} aria-label="Verifisert trener" />}</small></span></Link>
        <div className="pb-chosen-time"><CalendarDays size={18} aria-hidden="true" /><div><span>{selectedSlot ? 'Valgt tidspunkt' : 'Tidspunkt'}</span><strong>{selectedSlot ? formatSlot(selectedSlot.starts_at, true) : 'Velg en ledig tid'}</strong><small>{service.duration_minutes} min · {modeLabel}</small></div></div>
        <dl className="pb-price-lines"><div><dt>{service.title}</dt><dd>{money(service.price_nok)}</dd></div>{promotion && <div className="pb-discount"><dt>Rabatt ({promotion.code})</dt><dd>−{money(discount)}</dd></div>}<div><dt>Servicegebyr</dt><dd>{money(serviceFee)}</dd></div><div className="pb-total"><dt>Totalt</dt><dd>{money(total)}</dd></div></dl>
        <details className="pb-promo" open={Boolean(promo)}><summary>Har du en rabattkode?</summary><form key={promo || ''} method="get" action={`/book/${service.id}`}><input type="hidden" name="slot" value={selectedSlot?.id || slotId || ''} /><label htmlFor="booking-promo">Rabattkode</label><div><input id="booking-promo" name="promo" defaultValue={promo || ''} placeholder="Skriv inn kode" /><button className="btn secondary compact" type="submit">Bruk</button></div></form>{promo && !promotion && <p className="pb-code-error" role="alert">Koden er ugyldig, utløpt eller gjelder ikke denne tjenesten.</p>}{promotion && <p className="pb-code-success" role="status">Du sparer {money(discount)}.</p>}{promo && <Link href={`/book/${service.id}${selectedSlot || slotId ? `?slot=${encodeURIComponent(selectedSlot?.id || slotId!)}` : ''}`} className="pb-remove-promo">Fjern kode</Link>}</details>
        <div className="pb-confirmation"><ShieldCheck size={18} aria-hidden="true" /><div><strong>{isRequest ? 'Bekreftes av treneren' : 'Bekreftes automatisk'}</strong><p>{bookingExplanation}</p></div></div>
      </aside>

      <section className="pb-panel pb-details" id="bestillingsdetaljer" aria-labelledby="pb-details-title"><div className="pb-panel-heading"><span className="pb-step" aria-hidden="true">2</span><div><h2 id="pb-details-title">Bestillingsdetaljer</h2><p>{selectedSlot ? 'Opplysninger om hunden og det dere vil trene på.' : 'Velg et tidspunkt før du går videre.'}</p></div></div>
        {!selectedSlot ? <p className="pb-next-step">Når du har valgt en ledig tid, kan du fylle ut detaljer og bekrefte bestillingen her.</p> : !user ? <div className="pb-account-step"><h3>Logg inn for å bestille</h3><p>Etter innlogging velger du hund og fullfører bestillingen. Tidspunktet og rabattkoden følger med.</p><div className="pb-account-actions"><Link className="btn" href={`/login?next=${encodeURIComponent(returnPath)}`}>Logg inn<ArrowRight size={17} aria-hidden="true" /></Link><Link className="btn secondary" href={`/register?next=${encodeURIComponent(returnPath)}`}>Opprett konto</Link></div></div> : dogsResult.error ? <p className="pb-error" role="status">Vi kunne ikke hente hundene dine. Prøv å laste siden på nytt.</p> : !dogs.length ? <div className="pb-account-step"><Dog size={25} aria-hidden="true" /><h3>Legg til hunden din</h3><p>Treneren trenger å vite hvilken hund timen gjelder. Du kommer tilbake hit når hundeprofilen er klar.</p><Link className="btn" href={addDogHref}>Legg til hund<ArrowRight size={17} aria-hidden="true" /></Link></div> : <InlinePaymentForm action={requestBookingAction} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''} amountNok={total} captureMethod="manual" buttonLabel={isRequest ? `Reserver ${money(total)} og send forespørsel` : `Betal ${money(total)} og bestill`} className="pb-payment"><input type="hidden" name="serviceId" value={service.id} /><input type="hidden" name="slotId" value={selectedSlot.id} /><input type="hidden" name="promoCode" value={promotion?.code || ''} /><div className="pb-dog-field"><label>Hvilken hund gjelder timen?<select name="dogId" required defaultValue={dogs[0]?.id || ''}>{dogs.map(dog => <option key={dog.id} value={dog.id}>{dog.name}{dogMeta(dog) ? ` · ${dogMeta(dog)}` : ''}</option>)}</select></label><Link href={addDogHref}>Legg til eller rediger hund</Link></div><label className="pb-note-field">Hva ønsker du hjelp med? <span>(valgfritt)</span><textarea name="note" maxLength={1500} rows={4} placeholder="Fortell litt om hunden og hva dere vil jobbe med." /></label><div className="pb-payment-notice"><Check size={17} aria-hidden="true" /><p>{bookingExplanation}</p></div></InlinePaymentForm>}
      </section>
    </div>
  </main>;
}
