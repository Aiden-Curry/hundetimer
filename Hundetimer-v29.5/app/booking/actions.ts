'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { releaseOrRefundBookingPayment } from '@/lib/stripe/cancellation';
import { notifyBookingCancelled, notifyRescheduleAccepted, notifyRescheduleDeclined } from '@/lib/email/notifications';
import { deleteBookingCalendarEvent, syncBookingToCalendar } from '@/lib/calendar/server';
import { redeemPromotionForPurchase, releasePromotionForPurchase } from '@/lib/promotions/server';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Noe gikk galt.';
}

async function getCustomerBooking(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/booking/${bookingId}`)}`);
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, customer_id, status, payment_status, stripe_payment_intent_id, stripe_refund_id, refund_status, subtotal_nok, service_fee_nok, requested_starts_at')
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !booking || booking.customer_id !== user.id) throw error || new Error('Bestillingen finnes ikke.');
  return { supabase, booking };
}

async function captureIfNeeded(booking: { id: string; payment_status: string; stripe_payment_intent_id: string | null }) {
  if (booking.payment_status === 'captured') return;
  if (booking.payment_status !== 'authorized' || !booking.stripe_payment_intent_id) throw new Error('Betalingen er ikke autorisert.');
  const intent = await getStripe().paymentIntents.capture(booking.stripe_payment_intent_id);
  if (intent.status !== 'succeeded') throw new Error(`Betalingen kunne ikke trekkes (${intent.status}).`);
  await createAdminClient().from('bookings').update({
    payment_status: 'captured',
    payment_captured_at: new Date().toISOString(),
  }).eq('id', booking.id);
  await redeemPromotionForPurchase('booking', booking.id);
}

async function cancelIfNeeded(booking: { id: string; payment_status: string; stripe_payment_intent_id: string | null }) {
  if (booking.payment_status === 'cancelled') return;
  if (booking.payment_status === 'authorized' && booking.stripe_payment_intent_id) {
    const intent = await getStripe().paymentIntents.cancel(booking.stripe_payment_intent_id);
    if (intent.status !== 'canceled') throw new Error('Kortreservasjonen kunne ikke frigjøres.');
    await createAdminClient().from('bookings').update({
      payment_status: 'cancelled',
      payment_cancelled_at: new Date().toISOString(),
    }).eq('id', booking.id);
    await releasePromotionForPurchase('booking', booking.id);
  }
}

export async function acceptRescheduleAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  try {
    const { supabase, booking } = await getCustomerBooking(bookingId);
    await captureIfNeeded(booking);
    const { error } = await supabase.rpc('accept_reschedule', { p_booking_id: bookingId });
    if (error) throw error;
    await syncBookingToCalendar(bookingId);
    await notifyRescheduleAccepted(bookingId);
  } catch (error) {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath(`/booking/${bookingId}`);
  revalidatePath('/account');
  redirect(`/booking/${bookingId}?updated=1`);
}

export async function declineRescheduleAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  try {
    const { supabase, booking } = await getCustomerBooking(bookingId);
    await cancelIfNeeded(booking);
    const { error } = await supabase.rpc('decline_reschedule', { p_booking_id: bookingId });
    if (error) throw error;
    await notifyRescheduleDeclined(bookingId);
  } catch (error) {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath(`/booking/${bookingId}`);
  revalidatePath('/account');
  redirect(`/booking/${bookingId}?updated=1`);
}

export async function cancelBookingAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  const reason = String(formData.get('reason') || '').trim();

  try {
    const { supabase, booking } = await getCustomerBooking(bookingId);
    if (!['pending', 'reschedule_offered', 'confirmed'].includes(booking.status)) {
      throw new Error('Denne bestillingen kan ikke avbestilles.');
    }
    if (new Date(booking.requested_starts_at) <= new Date()) throw new Error('Timen har allerede startet.');

    await releaseOrRefundBookingPayment(booking, 'customer');
    await releasePromotionForPurchase('booking', bookingId);
    const { error } = await supabase.rpc('cancel_booking_by_customer', {
      p_booking_id: bookingId,
      p_reason: reason || null,
    });
    if (error) throw error;
    await deleteBookingCalendarEvent(bookingId);
    await notifyBookingCancelled(bookingId, 'customer');
  } catch (error) {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath(`/booking/${bookingId}`);
  revalidatePath('/account');
  revalidatePath('/trainer-dashboard');
  redirect(`/booking/${bookingId}?updated=1`);
}
