import type Stripe from 'stripe';
import { requireTrainerPaymentReady } from '@/lib/stripe/payment-readiness';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { notifyBookingConfirmed, notifyBookingRequested, notifyTrainerBookingConfirmed } from '@/lib/email/notifications';
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
  const { data: booking } = await admin.from('bookings').select('id, trainer_id, service_id, status, payment_status, stripe_payment_intent_id').eq('id', bookingId).maybeSingle();
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
      await requireTrainerPaymentReady(booking.trainer_id);
      const captured = await stripe.paymentIntents.capture(paymentIntent.id);
      if (captured.status === 'succeeded') {
        await admin.from('bookings').update({ payment_status: 'captured', payment_captured_at: new Date().toISOString() }).eq('id', bookingId);
        const { error: confirmError } = await admin.rpc('system_confirm_booking', { p_booking_id: bookingId, p_event_type: 'booking_confirmed_instant' });
        if (confirmError) throw confirmError;
        await redeemPromotionForPurchase('booking', bookingId);
        await syncBookingToCalendar(bookingId);
        await notifyBookingConfirmed(bookingId, 'instant');
      }
    } else {
      await notifyBookingRequested(bookingId);
    }
  }
  if (paymentIntent.status === 'succeeded') await syncBookingPaymentIntent(paymentIntent);
  await notifyTrainerBookingConfirmed(bookingId);
  return bookingId;
}


export function connectedAccountStatus(account: Stripe.V2.Core.Account) {
  const stripeBalance = account.configuration?.recipient?.capabilities?.stripe_balance;
  const transferStatus = stripeBalance?.stripe_transfers?.status ?? null;
  const payoutStatus = stripeBalance?.payouts?.status ?? null;

  const actionRequired = (account.requirements?.entries ?? []).some((entry) => {
    const deadline = entry.minimum_deadline?.status;
    return entry.awaiting_action_from === 'user' && (deadline === 'currently_due' || deadline === 'past_due');
  });

  const transfersActive = transferStatus === 'active';
  // Recipient accounts are created specifically to receive platform transfers.
  // Stripe may omit a separate payouts capability from the included Recipient
  // configuration, so an active transfer capability is the fallback readiness
  // signal when no payout capability status is returned.
  const payoutsEnabled = payoutStatus ? payoutStatus === 'active' : transfersActive;
  const detailsSubmitted = !actionRequired;

  return {
    detailsSubmitted,
    payoutsEnabled,
    transfersActive,
    transferStatus,
    payoutStatus,
  };
}

export async function syncConnectedAccount(account: Stripe.V2.Core.Account, fallbackTrainerId?: string) {
  const trainerId = account.metadata?.trainer_id || fallbackTrainerId;
  if (!trainerId) return null;

  const status = connectedAccountStatus(account);
  const admin = createAdminClient();
  const { error } = await admin.from('trainer_payment_accounts').upsert({
    trainer_id: trainerId,
    stripe_account_id: account.id,
    details_submitted: status.detailsSubmitted,
    payouts_enabled: status.payoutsEnabled,
    transfers_active: status.transfersActive,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return trainerId;
}

export async function syncBookingPaymentIntent(intentOrId: Stripe.PaymentIntent | string) {
  const stripe = getStripe();
  const paymentIntent = typeof intentOrId === 'string'
    ? await stripe.paymentIntents.retrieve(intentOrId)
    : intentOrId;
  const bookingId = paymentIntent.metadata?.booking_id;
  if (!bookingId) return null;

  const admin = createAdminClient();
  const { data: booking } = await admin.from('bookings').select('id, trainer_id, service_id, status, payment_status, stripe_payment_intent_id').eq('id', bookingId).maybeSingle();
  if (!booking) return { bookingId, status: paymentIntent.status, clientSecret: paymentIntent.client_secret };
  if (!['pending', 'confirmed', 'reschedule_offered'].includes(booking.status) || ['refunded', 'cancelled'].includes(booking.payment_status)) return { bookingId, status: paymentIntent.status, clientSecret: paymentIntent.client_secret };
  if (booking.stripe_payment_intent_id && booking.stripe_payment_intent_id !== paymentIntent.id) throw new Error('Betalingen tilhører ikke bestillingen.');

  if (paymentIntent.status === 'requires_capture' && booking.payment_status === 'checkout_pending') {
    const { data: claimed } = await admin.from('bookings').update({
      stripe_payment_intent_id: paymentIntent.id,
      stripe_checkout_session_id: null,
      payment_status: 'authorized',
      payment_authorized_at: new Date().toISOString(),
      trainer_response_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', bookingId).eq('payment_status', 'checkout_pending').select('id').maybeSingle();
    if (!claimed) return { bookingId, status: paymentIntent.status, clientSecret: paymentIntent.client_secret };

    await admin.from('booking_events').insert({
      booking_id: bookingId,
      event_type: 'payment_authorized',
      payload: { payment_intent_id: paymentIntent.id, payment_flow: 'payment_element' },
    });

    const { data: service } = await admin.from('services').select('booking_mode').eq('id', booking.service_id).maybeSingle();
    if (service?.booking_mode === 'instant') {
      await requireTrainerPaymentReady(booking.trainer_id);
      const captured = await stripe.paymentIntents.capture(paymentIntent.id);
      if (captured.status === 'succeeded') {
        await admin.from('bookings').update({ payment_status: 'captured', payment_captured_at: new Date().toISOString() }).eq('id', bookingId);
        const { error: confirmError } = await admin.rpc('system_confirm_booking', { p_booking_id: bookingId, p_event_type: 'booking_confirmed_instant' });
        if (confirmError) throw confirmError;
        await redeemPromotionForPurchase('booking', bookingId);
        await syncBookingToCalendar(bookingId);
        await notifyBookingConfirmed(bookingId, 'instant');
        return { bookingId, status: captured.status, clientSecret: captured.client_secret };
      }
    } else {
      await notifyBookingRequested(bookingId);
    }
  }

  if (paymentIntent.status === 'succeeded' && booking.payment_status !== 'captured') {
    await admin.from('bookings').update({
      payment_status: 'captured',
      payment_captured_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntent.id,
    }).eq('id', bookingId).in('status', ['pending', 'confirmed', 'reschedule_offered']).in('payment_status', ['checkout_pending', 'authorized']);
  }

  if (paymentIntent.status === 'succeeded') {
    if (booking.status === 'pending') {
      const { data: service } = await admin.from('services').select('booking_mode').eq('id', booking.service_id).maybeSingle();
      if (service?.booking_mode === 'instant') {
        await requireTrainerPaymentReady(booking.trainer_id);
        const { error } = await admin.rpc('system_confirm_booking', { p_booking_id: bookingId, p_event_type: 'booking_confirmed_instant' });
        if (error) throw error;
        await redeemPromotionForPurchase('booking', bookingId);
        await syncBookingToCalendar(bookingId);
        await notifyBookingConfirmed(bookingId, 'instant');
      }
    }
    await notifyTrainerBookingConfirmed(bookingId);
  }
  return { bookingId, status: paymentIntent.status, clientSecret: paymentIntent.client_secret };
}
