import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';

type CancellableBooking = {
  id: string;
  payment_status: string;
  stripe_payment_intent_id: string | null;
  stripe_refund_id?: string | null;
  refund_status?: string | null;
  subtotal_nok?: number;
  service_fee_nok?: number;
};

export async function releaseOrRefundBookingPayment(booking: CancellableBooking, actor: 'customer' | 'trainer' | 'system') {
  const admin = createAdminClient();
  const stripe = getStripe();

  if (booking.payment_status === 'cancelled' || booking.payment_status === 'refunded') {
    return { kind: booking.payment_status as 'cancelled' | 'refunded' };
  }

  if (!booking.stripe_payment_intent_id) {
    throw new Error('Bestillingen mangler Stripe-betaling.');
  }

  if (booking.payment_status === 'authorized') {
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    if (intent.status === 'requires_capture') {
      await stripe.paymentIntents.cancel(intent.id, { cancellation_reason: actor === 'customer' ? 'requested_by_customer' : 'abandoned' });
    } else if (intent.status !== 'canceled') {
      throw new Error(`Kortreservasjonen kan ikke frigjøres (${intent.status}).`);
    }

    await admin.from('bookings').update({
      payment_status: 'cancelled',
      payment_cancelled_at: new Date().toISOString(),
    }).eq('id', booking.id);

    return { kind: 'cancelled' as const };
  }

  if (booking.payment_status === 'captured') {
    let refund;
    if (booking.stripe_refund_id) {
      refund = await stripe.refunds.retrieve(booking.stripe_refund_id);
    } else {
      refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        reason: actor === 'customer' ? 'requested_by_customer' : undefined,
        metadata: { booking_id: booking.id, cancelled_by: actor },
      });
    }

    const refundStatus = refund.status || 'pending';
    const succeeded = refundStatus === 'succeeded';
    await admin.from('bookings').update({
      stripe_refund_id: refund.id,
      refund_status: refundStatus,
      refund_amount_nok: Math.round(refund.amount / 100),
      refunded_at: succeeded ? new Date().toISOString() : null,
      payment_status: succeeded ? 'refunded' : 'captured',
    }).eq('id', booking.id);

    return { kind: 'refund' as const, refundStatus, refundId: refund.id };
  }

  throw new Error(`Betalingen kan ikke avbrytes fra statusen ${booking.payment_status}.`);
}
