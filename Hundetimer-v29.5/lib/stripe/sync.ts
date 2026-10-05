import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { notifyBookingConfirmed, notifyBookingRequested } from '@/lib/email/notifications';
import { syncBookingToCalendar } from '@/lib/calendar/server';
import { redeemPromotionForPurchase } from '@/lib/promotions/server';

export async function syncCheckoutSession(sessionOrId: Stripe.Checkout.Session | string, expectedBookingId?: string) {
  const stripe = getStripe();
  const session = typeof sessionOrId === 'string'
    ? await stripe.checkout.sessions.retrieve(sessionOrId, { expand: ['payment_intent'] })
    : sessionOrId;

  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return null;
  if (expectedBookingId && bookingId !== expectedBookingId) return null;

  const paymentIntent = typeof session.payment_intent === 'string'
    ? await stripe.paymentIntents.retrieve(session.payment_intent)
    : session.payment_intent;
  if (!paymentIntent) return bookingId;

  const admin = createAdminClient();
  const { data: booking } = await admin.from('bookings').select('id, service_id, status, payment_status').eq('id', bookingId).maybeSingle();
  if (!booking) return bookingId;

  if (paymentIntent.status === 'requires_capture' && booking.payment_status === 'checkout_pending') {
    await admin.from('bookings').update({
      stripe_payment_intent_id: paymentIntent.id,
      stripe_checkout_session_id: session.id,
      payment_status: 'authorized',
      payment_authorized_at: new Date().toISOString(),
      trainer_response_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', bookingId);

    await admin.from('booking_events').insert({
      booking_id: bookingId,
      event_type: 'payment_authorized',
      payload: { payment_intent_id: paymentIntent.id, checkout_session_id: session.id },
    });

    const { data: service } = await admin.from('services').select('booking_mode').eq('id', booking.service_id).maybeSingle();
    if (service?.booking_mode === 'instant') {
      const captured = await stripe.paymentIntents.capture(paymentIntent.id);
      if (captured.status === 'succeeded') {
        await admin.from('bookings').update({ payment_status: 'captured', payment_captured_at: new Date().toISOString() }).eq('id', bookingId);
        await admin.rpc('system_confirm_booking', { p_booking_id: bookingId, p_event_type: 'booking_confirmed_instant' });
        await redeemPromotionForPurchase('booking', bookingId);
        await syncBookingToCalendar(bookingId);
        await notifyBookingConfirmed(bookingId, 'instant');
      }
    } else {
      await notifyBookingRequested(bookingId);
    }
  }
  return bookingId;
}


export async function syncConnectedAccount(account: Stripe.Account) {
  const trainerId = account.metadata?.trainer_id;
  if (!trainerId) return null;
  const admin = createAdminClient();
  const { error } = await admin.from('trainer_payment_accounts').upsert({
    trainer_id: trainerId,
    stripe_account_id: account.id,
    details_submitted: Boolean(account.details_submitted),
    payouts_enabled: Boolean(account.payouts_enabled),
    transfers_active: account.capabilities?.transfers === 'active',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return trainerId;
}
