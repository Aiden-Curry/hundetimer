import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { notifyOnlineCoursePurchased } from '@/lib/email/online-course-notifications';
import { redeemPromotionForPurchase } from '@/lib/promotions/server';

export async function syncOnlineCourseCheckoutSession(sessionOrId: Stripe.Checkout.Session | string) {
  const stripe = getStripe();
  const session = typeof sessionOrId === 'string'
    ? await stripe.checkout.sessions.retrieve(sessionOrId, { expand: ['payment_intent'] })
    : sessionOrId;
  const purchaseId = session.metadata?.online_course_purchase_id;
  if (!purchaseId) return null;
  const intent = typeof session.payment_intent === 'string'
    ? await stripe.paymentIntents.retrieve(session.payment_intent)
    : session.payment_intent;
  if (!intent || intent.status !== 'succeeded') return purchaseId;
  const admin = createAdminClient();
  await admin.rpc('system_confirm_online_course_purchase', {
    p_purchase_id: purchaseId,
    p_payment_intent_id: intent.id,
    p_checkout_session_id: session.id,
  });
  await redeemPromotionForPurchase('online_course', purchaseId);
  await notifyOnlineCoursePurchased(purchaseId);
  return purchaseId;
}

export async function syncOnlineCoursePaymentIntent(intentOrId: Stripe.PaymentIntent | string) {
  const stripe = getStripe();
  const intent = typeof intentOrId === 'string' ? await stripe.paymentIntents.retrieve(intentOrId) : intentOrId;
  const purchaseId = intent.metadata?.online_course_purchase_id;
  if (!purchaseId) return null;
  if (intent.status !== 'succeeded') return { purchaseId, status: intent.status, clientSecret: intent.client_secret };
  const admin = createAdminClient();
  const { data: current } = await admin.from('online_course_purchases').select('status,payment_status').eq('id', purchaseId).maybeSingle();
  if (current?.status === 'active' && current?.payment_status === 'captured') return { purchaseId, status: intent.status, clientSecret: intent.client_secret };
  await admin.rpc('system_confirm_online_course_purchase', {
    p_purchase_id: purchaseId,
    p_payment_intent_id: intent.id,
    p_checkout_session_id: null,
  });
  await redeemPromotionForPurchase('online_course', purchaseId);
  await notifyOnlineCoursePurchased(purchaseId);
  return { purchaseId, status: intent.status, clientSecret: intent.client_secret };
}
