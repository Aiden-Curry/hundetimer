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
