import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStripeConfigured } from '@/lib/stripe/server';
import { syncCheckoutSession } from '@/lib/stripe/sync';
import { acceptRescheduleAction, declineRescheduleAction, cancelBookingAction } from '../actions';
import { submitReviewAction } from '@/app/reviews/actions';

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

const statusText: Record<string, string> = { pending: 'Venter på treneren', confirmed: 'Bekreftet', reschedule_offered: 'Nytt tidspunkt foreslått', declined_by_trainer: 'Avslått av treneren', cancelled_by_customer: 'Avbestilt', refunded: 'Refundert', completed: 'Fullført' };
const paymentText: Record<string, string> = { checkout_pending: 'Venter på betaling', authorized: 'Kort autorisert', captured: 'Betalt', cancelled: 'Reservasjon frigitt', failed: 'Betaling feilet', refunded: 'Refundert', not_started: 'Ikke startet' };

export default async function BookingDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; updated?: string; checkout?: string; session_id?: string }> }) {
  const { id } = await params;
  const { error, updated, checkout, session_id: sessionId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/booking/${id}`)}`);

  if (checkout === 'success' && sessionId && isStripeConfigured()) {
    try { await syncCheckoutSession(sessionId, id); } catch { /* webhook can retry */ }
  }

  const { data: booking } = await supabase.from('bookings').select('id, customer_id, trainer_id, service_id, dog_id, status, payment_status, requested_starts_at, subtotal_nok, service_fee_nok, platform_fee_nok, dog_name, customer_note, created_at, trainer_response_due_at, cancelled_by, cancellation_reason, expired_at, refund_status, refund_amount_nok, refunded_at').eq('id', id).maybeSingle();
  if (!booking) notFound();

  const [{ data: service }, { data: trainer }, { data: offer }, dogResult, { data: review }, { data: lessonNotes }] = await Promise.all([
    supabase.from('services').select('title, duration_minutes').eq('id', booking.service_id).maybeSingle(),
    supabase.from('trainer_profiles').select('business_name, slug, city').eq('id', booking.trainer_id).maybeSingle(),
    supabase.from('reschedule_offers').select('id, proposed_starts_at, proposed_ends_at, note, status').eq('booking_id', booking.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    booking.dog_id ? supabase.from('dogs').select('name, breed, birth_date, sex, weight_kg, notes').eq('id', booking.dog_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('reviews').select('id, rating, comment, trainer_reply, created_at').eq('booking_id', booking.id).maybeSingle(),
    supabase.from('lesson_shared_notes').select('shared_summary,homework,next_steps,published_at').eq('booking_id', booking.id).maybeSingle(),
  ]);
  const dog = dogResult.data;

  const isCustomer = booking.customer_id === user.id;
  const isTrainer = booking.trainer_id === user.id;
  const total = booking.subtotal_nok + booking.service_fee_nok;
  const canCustomerCancel = isCustomer && ['pending', 'reschedule_offered', 'confirmed'].includes(booking.status) && ['authorized', 'captured'].includes(booking.payment_status) && new Date(booking.requested_starts_at) > new Date();
  const visibleStatus = booking.expired_at ? 'Utløpt' : (statusText[booking.status] || booking.status);
  const canReview = isCustomer && booking.status === 'completed' && booking.payment_status === 'captured';

  return <main className="page-shell narrow booking-detail-shell"><Link className="text-link" href={isCustomer ? '/account' : '/trainer-dashboard'}>← Tilbake</Link><section className="booking-detail-card">
    <div className="booking-detail-heading"><div><span className="eyebrow">Bestilling</span><h1>{service?.title || 'Hundetrening'}</h1><p className="muted">{trainer?.business_name || 'Hundetrener'}{trainer?.city ? `, ${trainer.city}` : ''}</p></div><div className="booking-heading-actions"><span className={`status ${booking.expired_at ? 'expired' : booking.status}`}>{visibleStatus}</span><p className="muted small">{paymentText[booking.payment_status] || booking.payment_status}</p><Link className="btn secondary compact" href={`/messages/${booking.id}`}>Åpne meldinger</Link>{isTrainer ? <Link className="btn compact" href={`/trainer-dashboard/journal/booking/${booking.id}`}>Treningsjournal</Link> : null}</div></div>
    {updated ? <p className="form-success">Bestillingen er oppdatert.</p> : null}{error ? <p className="form-error form-error-block">{error}</p> : null}
    <div className="booking-facts"><div><span>Tidspunkt</span><strong>{dateTime(booking.requested_starts_at)}</strong></div><div><span>Hund</span><strong>{booking.dog_name || 'Ikke oppgitt'}</strong></div><div><span>Varighet</span><strong>{service?.duration_minutes || '?'} min</strong></div><div><span>Total</span><strong>{total} kr</strong></div></div>
    {dog ? <div className="booking-note dog-booking-profile"><span className="eyebrow">Om {dog.name}</span><p>{[dog.breed, dog.birth_date ? `født ${new Intl.DateTimeFormat('nb-NO').format(new Date(`${dog.birth_date}T12:00:00`))}` : null, dog.sex === 'female' ? 'tispe' : dog.sex === 'male' ? 'hannhund' : null, dog.weight_kg ? `${Number(dog.weight_kg).toLocaleString('nb-NO')} kg` : null].filter(Boolean).join(' · ') || 'Ingen ekstra profilopplysninger.'}</p>{dog.notes ? <p className="muted">{dog.notes}</p> : null}</div> : null}
    {booking.customer_note ? <div className="booking-note"><span className="eyebrow">Melding til treneren</span><p>{booking.customer_note}</p></div> : null}
    {lessonNotes && (lessonNotes.published_at || isTrainer) ? <div className="booking-note lesson-shared-note"><span className="eyebrow">{lessonNotes.published_at ? 'Oppsummering fra treneren' : 'Kundedelen er ikke publisert ennå'}</span>{lessonNotes.shared_summary ? <><h3>Fra timen</h3><p>{lessonNotes.shared_summary}</p></> : null}{lessonNotes.homework ? <><h3>Hjemmeoppgaver</h3><p>{lessonNotes.homework}</p></> : null}{lessonNotes.next_steps ? <><h3>Neste steg</h3><p>{lessonNotes.next_steps}</p></> : null}</div> : null}
    {booking.payment_status === 'checkout_pending' ? <div className="notice">Stripe-betalingen er ikke ferdig ennå. Hvis du nettopp betalte, oppdater siden om et øyeblikk.</div> : null}
    {booking.status === 'pending' && booking.payment_status === 'authorized' ? <div className="notice"><strong>Beløpet er reservert på kortet ditt.</strong><span>Det trekkes først når treneren bekrefter. Ved avslag frigjøres reservasjonen.</span></div> : null}
    {booking.status === 'confirmed' && booking.payment_status === 'captured' ? <div className="success-notice"><strong>Timen er bekreftet og betalt.</strong><span>Du finner alle detaljene her på Min side.</span></div> : null}
    {booking.expired_at ? <div className="notice"><strong>Forespørselen utløp.</strong><span>Treneren svarte ikke innen 24 timer, og kortreservasjonen ble frigitt.</span></div> : null}
    {booking.cancelled_by && !booking.expired_at ? <div className="notice"><strong>Bestillingen er avbestilt.</strong><span>{booking.refund_status === 'succeeded' ? `Hele beløpet på ${booking.refund_amount_nok} kr er refundert.` : booking.refund_status === 'pending' ? 'Refusjonen er sendt til Stripe og behandles.' : booking.refund_status === 'failed' ? 'Refusjonen feilet. Kontakt kundeservice slik at den kan behandles manuelt.' : booking.payment_status === 'cancelled' ? 'Kortreservasjonen er frigitt.' : 'Betalingen oppdateres.'}{booking.cancellation_reason ? ` Grunn: ${booking.cancellation_reason}` : ''}</span></div> : null}
    {booking.status === 'reschedule_offered' && offer && isCustomer ? <div className="reschedule-card"><span className="eyebrow">Treneren foreslår en annen tid</span><h2>{dateTime(offer.proposed_starts_at)}</h2>{offer.note ? <p>{offer.note}</p> : null}<div className="booking-actions-inline"><form action={acceptRescheduleAction}><input type="hidden" name="bookingId" value={booking.id} /><button className="btn" type="submit">Godta og betal</button></form><form action={declineRescheduleAction}><input type="hidden" name="bookingId" value={booking.id} /><button className="btn secondary" type="submit">Nei takk</button></form></div><p className="muted small">Hvis du godtar, trekkes det allerede autoriserte beløpet. Hvis du avslår, frigjøres kortreservasjonen.</p></div> : null}
    {canCustomerCancel ? <div className="cancellation-card"><span className="eyebrow">Avbestilling</span><h2>Kan du ikke møte?</h2><p className="muted">I testversjonen refunderes hele beløpet ved avbestilling før timen starter. Hvis betalingen bare er reservert, frigjøres reservasjonen.</p><form action={cancelBookingAction} className="cancel-booking-form"><input type="hidden" name="bookingId" value={booking.id} /><label>Grunn (valgfritt)<input name="reason" maxLength={500} placeholder="For eksempel sykdom eller endrede planer" /></label><button className="btn danger-button" type="submit">Avbestill og refunder</button></form></div> : null}

    {canReview ? <div className="review-form-card"><span className="eyebrow">Din vurdering</span><h2>{review ? 'Oppdater vurderingen din' : 'Hvordan var timen?'}</h2><p className="muted">Bare fullførte bestillinger kan vurderes. Vurderingen vises som verifisert på trenerprofilen.</p><form action={submitReviewAction} className="review-form"><input type="hidden" name="bookingId" value={booking.id} /><fieldset className="star-picker"><legend>Vurdering</legend>{[1,2,3,4,5].map((value) => <label key={value}><input type="radio" name="rating" value={value} defaultChecked={review?.rating === value} required /><span>{'★'.repeat(value)}{'☆'.repeat(5-value)}</span><small>{value}/5</small></label>)}</fieldset><label>Kommentar (valgfritt)<textarea name="comment" maxLength={2000} rows={5} defaultValue={review?.comment || ''} placeholder="Fortell andre hundeeiere om opplevelsen" /></label><button className="btn" type="submit">{review ? 'Oppdater vurdering' : 'Publiser vurdering'}</button></form>{review?.trainer_reply ? <div className="trainer-review-reply"><strong>Svar fra {trainer?.business_name || 'treneren'}</strong><p>{review.trainer_reply}</p></div> : null}</div> : null}
    {trainer?.slug ? <Link className="text-link" href={`/trainers/${trainer.slug}`}>Se trenerprofil</Link> : null}
  </section></main>;
}
