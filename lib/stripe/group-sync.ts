import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { notifyGroupEnrollmentConfirmed } from '@/lib/email/group-notifications';
import { redeemPromotionForPurchase } from '@/lib/promotions/server';

export async function syncGroupCheckoutSession(sessionOrId: Stripe.Checkout.Session | string) {
  const stripe = getStripe();
  const session = typeof sessionOrId === 'string' ? await stripe.checkout.sessions.retrieve(sessionOrId, { expand:['payment_intent'] }) : sessionOrId;
  const enrollmentId = session.metadata?.group_enrollment_id;
  if (!enrollmentId) return null;
  const intent = typeof session.payment_intent === 'string' ? await stripe.paymentIntents.retrieve(session.payment_intent) : session.payment_intent;
  if (!intent || intent.status !== 'succeeded') return enrollmentId;
  const admin = createAdminClient();
  await admin.rpc('system_confirm_group_enrollment', { p_enrollment_id: enrollmentId, p_payment_intent_id: intent.id, p_checkout_session_id: session.id });
  await redeemPromotionForPurchase('group', enrollmentId);
  await notifyGroupEnrollmentConfirmed(enrollmentId);
  return enrollmentId;
}

export async function syncGroupPaymentIntent(intentOrId: Stripe.PaymentIntent | string) {
  const stripe = getStripe();
  const intent = typeof intentOrId === 'string' ? await stripe.paymentIntents.retrieve(intentOrId) : intentOrId;
  const enrollmentId = intent.metadata?.group_enrollment_id;
  if (!enrollmentId) return null;
  if (intent.status !== 'succeeded') return { enrollmentId, status: intent.status, clientSecret: intent.client_secret };
  const admin = createAdminClient();
  const { data: current } = await admin.from('group_enrollments').select('status,payment_status').eq('id', enrollmentId).maybeSingle();
  if (current?.status === 'confirmed' && current?.payment_status === 'captured') return { enrollmentId, status: intent.status, clientSecret: intent.client_secret };
  await admin.rpc('system_confirm_group_enrollment', {
    p_enrollment_id: enrollmentId,
    p_payment_intent_id: intent.id,
    p_checkout_session_id: null,
  });
  await redeemPromotionForPurchase('group', enrollmentId);
  await notifyGroupEnrollmentConfirmed(enrollmentId);
  return { enrollmentId, status: intent.status, clientSecret: intent.client_secret };
}
