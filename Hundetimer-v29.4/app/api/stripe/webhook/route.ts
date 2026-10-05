import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { syncCheckoutSession } from '@/lib/stripe/sync';
import { notifyRefundSucceeded } from '@/lib/email/notifications';
import { syncGroupCheckoutSession } from '@/lib/stripe/group-sync';
import { notifyGroupEnrollmentCancelled } from '@/lib/email/group-notifications';
import { syncOnlineCourseCheckoutSession } from '@/lib/stripe/online-course-sync';
import { notifyPendingWaitlistOffers } from '@/lib/email/waitlist-notifications';
import { releasePromotionForPurchase } from '@/lib/promotions/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET mangler.' }, { status: 500 });

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Mangler Stripe-signatur.' }, { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Ugyldig webhook.' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.purchase_type === 'online_course' || session.metadata?.online_course_purchase_id) await syncOnlineCourseCheckoutSession(session);
      else if (session.metadata?.purchase_type === 'group' || session.metadata?.group_enrollment_id) await syncGroupCheckoutSession(session);
      else await syncCheckoutSession(session);
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const purchaseId = session.metadata?.online_course_purchase_id;
      const enrollmentId = session.metadata?.group_enrollment_id;
      const bookingId = session.metadata?.booking_id;
      if (purchaseId) { await releasePromotionForPurchase('online_course', purchaseId); await admin.rpc('system_expire_online_course_checkout', { p_purchase_id: purchaseId }); }
      else if (enrollmentId) {
        const { data: enrollment } = await admin.from('group_enrollments').select('offering_id').eq('id', enrollmentId).maybeSingle();
        await releasePromotionForPurchase('group', enrollmentId);
        await admin.rpc('system_expire_group_checkout', { p_enrollment_id: enrollmentId });
        if (enrollment?.offering_id) await notifyPendingWaitlistOffers(enrollment.offering_id);
      }
      else if (bookingId) { await releasePromotionForPurchase('booking', bookingId); await admin.rpc('system_expire_checkout_booking', { p_booking_id: bookingId }); }
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const enrollmentId = intent.metadata?.group_enrollment_id;
      const bookingId = intent.metadata?.booking_id;
      if (!enrollmentId && bookingId) {
        await admin.from('bookings').update({
          payment_status: 'captured',
          payment_captured_at: new Date().toISOString(),
          stripe_payment_intent_id: intent.id,
        }).eq('id', bookingId);
      }
    }

    if (event.type === 'payment_intent.canceled') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const enrollmentId = intent.metadata?.group_enrollment_id;
      const bookingId = intent.metadata?.booking_id;
      if (enrollmentId) {
        const { data: enrollment } = await admin.from('group_enrollments').select('offering_id').eq('id', enrollmentId).maybeSingle();
        await releasePromotionForPurchase('group', enrollmentId);
        await admin.rpc('system_expire_group_checkout', { p_enrollment_id: enrollmentId });
        if (enrollment?.offering_id) await notifyPendingWaitlistOffers(enrollment.offering_id);
      } else if (bookingId) {
        await releasePromotionForPurchase('booking', bookingId);
        await admin.from('bookings').update({
          payment_status: 'cancelled',
          payment_cancelled_at: new Date().toISOString(),
        }).eq('id', bookingId);
      }
    }

    if (event.type === 'refund.created' || event.type === 'refund.updated' || event.type === 'refund.failed') {
      const refund = event.data.object as Stripe.Refund;
      const enrollmentId = refund.metadata?.group_enrollment_id;
      const bookingId = refund.metadata?.booking_id;
      if (enrollmentId) {
        const succeeded = refund.status === 'succeeded';
        await admin.rpc('system_update_group_refund', { p_enrollment_id: enrollmentId, p_refund_id: refund.id, p_refund_status: refund.status || 'pending' });
        if (succeeded) {
          await notifyGroupEnrollmentCancelled(enrollmentId);
          const { data: enrollment } = await admin.from('group_enrollments').select('offering_id').eq('id', enrollmentId).maybeSingle();
          if (enrollment?.offering_id) await notifyPendingWaitlistOffers(enrollment.offering_id);
        }
      } else if (bookingId) {
        const succeeded = refund.status === 'succeeded';
        await admin.from('bookings').update({
          stripe_refund_id: refund.id,
          refund_status: refund.status || 'pending',
          refund_amount_nok: Math.round(refund.amount / 100),
          refunded_at: succeeded ? new Date().toISOString() : null,
          payment_status: succeeded ? 'refunded' : 'captured',
        }).eq('id', bookingId);
        if (succeeded) await notifyRefundSucceeded(bookingId, refund.id);
      }
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook-feil.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
