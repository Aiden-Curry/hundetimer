'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { releaseOrRefundBookingPayment } from '@/lib/stripe/cancellation';
import { expireOverdueTrainerResponses } from '@/lib/bookings/expiry';
import { notifyBookingCancelled, notifyBookingCompleted, notifyBookingConfirmed, notifyBookingDeclined, notifyRescheduleOffered } from '@/lib/email/notifications';
import { deleteBookingCalendarEvent, syncBookingToCalendar } from '@/lib/calendar/server';
import { redeemPromotionForPurchase, releasePromotionForPurchase } from '@/lib/promotions/server';

function toMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Noe gikk galt.');
  return 'Noe gikk galt.';
}

async function ensureUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard');
  return { supabase, user };
}

async function getTrainerBooking(bookingId: string) {
  const { supabase, user } = await ensureUser();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, trainer_id, status, payment_status, stripe_payment_intent_id, stripe_refund_id, refund_status, subtotal_nok, service_fee_nok, requested_starts_at, trainer_response_due_at')
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !booking || booking.trainer_id !== user.id) throw error || new Error('Bestillingen finnes ikke.');
  return { supabase, user, booking };
}

async function captureIfNeeded(booking: { id: string; payment_status: string; stripe_payment_intent_id: string | null }) {
  if (booking.payment_status === 'captured') return;
  if (booking.payment_status !== 'authorized' || !booking.stripe_payment_intent_id) throw new Error('Kundens betaling er ikke autorisert.');
  const intent = await getStripe().paymentIntents.capture(booking.stripe_payment_intent_id);
  if (intent.status !== 'succeeded') throw new Error(`Betalingen kunne ikke trekkes (${intent.status}).`);
  await createAdminClient().from('bookings').update({
    payment_status: 'captured',
    payment_captured_at: new Date().toISOString(),
  }).eq('id', booking.id);
  await redeemPromotionForPurchase('booking', booking.id);
}

async function cancelAuthorizationIfNeeded(booking: { id: string; payment_status: string; stripe_payment_intent_id: string | null }) {
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

export async function confirmBookingAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  try {
    const { supabase, booking } = await getTrainerBooking(bookingId);
    if (booking.trainer_response_due_at && new Date(booking.trainer_response_due_at) <= new Date()) {
      await expireOverdueTrainerResponses({ bookingId });
      throw new Error('Svarfristen på 24 timer har gått ut. Kortreservasjonen er frigitt.');
    }
    await captureIfNeeded(booking);
    const { error } = await supabase.rpc('confirm_booking', { p_booking_id: bookingId });
    if (error) throw error;
    await syncBookingToCalendar(bookingId);
    await notifyBookingConfirmed(bookingId);
  } catch (error) {
    redirect(`/trainer-dashboard?error=${encodeURIComponent(toMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard');
  redirect('/trainer-dashboard?message=Bestillingen+er+bekreftet+og+betalingen+er+trukket');
}

export async function declineBookingAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  try {
    const { supabase, booking } = await getTrainerBooking(bookingId);
    await cancelAuthorizationIfNeeded(booking);
    const { error } = await supabase.rpc('decline_booking', { p_booking_id: bookingId });
    if (error) throw error;
    await notifyBookingDeclined(bookingId);
  } catch (error) {
    redirect(`/trainer-dashboard?error=${encodeURIComponent(toMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard');
  redirect('/trainer-dashboard?message=Bestillingen+er+avslått+og+kortreservasjonen+er+frigitt');
}

export async function offerRescheduleAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  const slotId = String(formData.get('slotId') || '');
  const note = String(formData.get('note') || '');
  try {
    if (!slotId) throw new Error('Velg et nytt tidspunkt.');
    const { supabase, booking } = await getTrainerBooking(bookingId);
    if (booking.trainer_response_due_at && new Date(booking.trainer_response_due_at) <= new Date()) {
      await expireOverdueTrainerResponses({ bookingId });
      throw new Error('Svarfristen på 24 timer har gått ut. Kortreservasjonen er frigitt.');
    }
    if (booking.payment_status !== 'authorized') throw new Error('Betalingen må være autorisert før du kan foreslå en ny tid.');
    const { error } = await supabase.rpc('offer_reschedule', { p_booking_id: bookingId, p_slot_id: slotId, p_note: note || null });
    if (error) throw error;
    await notifyRescheduleOffered(bookingId);
  } catch (error) {
    redirect(`/trainer-dashboard?error=${encodeURIComponent(toMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard');
  redirect('/trainer-dashboard?message=Nytt+tidspunkt+er+sendt+til+kunden');
}

export async function cancelConfirmedBookingAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  const reason = String(formData.get('reason') || '').trim();
  try {
    const { supabase, booking } = await getTrainerBooking(bookingId);
    if (!['pending', 'reschedule_offered', 'confirmed'].includes(booking.status)) throw new Error('Denne bestillingen kan ikke avbestilles.');
    if (new Date(booking.requested_starts_at) <= new Date()) throw new Error('Timen har allerede startet.');
    await releaseOrRefundBookingPayment(booking, 'trainer');
    await releasePromotionForPurchase('booking', bookingId);
    const { error } = await supabase.rpc('cancel_booking_by_trainer', { p_booking_id: bookingId, p_reason: reason || null });
    if (error) throw error;
    await deleteBookingCalendarEvent(bookingId);
    await notifyBookingCancelled(bookingId, 'trainer');
  } catch (error) {
    redirect(`/trainer-dashboard?error=${encodeURIComponent(toMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard');
  revalidatePath('/account');
  redirect('/trainer-dashboard?message=Bestillingen+er+avbestilt+og+betalingen+er+frigitt+eller+refundert');
}

export async function savePayoutDetailsAction(formData: FormData) {
  try {
    const { supabase, user } = await ensureUser();
    const accountHolderName = String(formData.get('accountHolderName') || '').trim();
    const bankAccountNumber = String(formData.get('bankAccountNumber') || '').replace(/\s+/g, '');
    const organisationNumber = String(formData.get('organisationNumber') || '').replace(/\s+/g, '');
    const vatRegistered = formData.get('vatRegistered') === 'on';

    if (!accountHolderName) throw new Error('Skriv inn navn på kontoeier.');
    if (!/^\d{11}$/.test(bankAccountNumber)) throw new Error('Norsk kontonummer må være 11 siffer.');

    const { error } = await supabase.from('trainer_payout_profiles').upsert({
      trainer_id: user.id,
      account_holder_name: accountHolderName,
      bank_account_number: bankAccountNumber,
      organisation_number: organisationNumber || null,
      vat_registered: vatRegistered,
      payout_ready: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    redirect(`/trainer-dashboard/finance?error=${encodeURIComponent(toMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard');
  revalidatePath('/trainer-dashboard/finance');
  redirect('/trainer-dashboard/finance?message=Utbetalingsopplysningene+er+lagret');
}

export async function markBookingCompletedAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  try {
    const { supabase } = await getTrainerBooking(bookingId);
    const { error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId });
    if (error) throw error;
    await notifyBookingCompleted(bookingId);
  } catch (error) {
    redirect(`/trainer-dashboard?error=${encodeURIComponent(toMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard');
  redirect('/trainer-dashboard?message=Timen+er+markert+som+fullført+og+lagt+til+neste+utbetaling');
}
