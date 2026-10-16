import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { notifyCoursePurchaseEvent } from '@/lib/email/course-purchase-events';

// Retrieve current Stripe state even for webhooks, so out-of-order events cannot
// overwrite a successful refund with an earlier pending/failed state.
export async function syncOnlineCourseRefund(refundOrId: Stripe.Refund | string) {
  const stripe = getStripe();
  const refund = await stripe.refunds.retrieve(typeof refundOrId === 'string' ? refundOrId : refundOrId.id);
  const purchaseId = refund.metadata?.online_course_purchase_id;
  if (!purchaseId) return;
  const admin = createAdminClient();
  const { data: purchase, error } = await admin.from('online_course_purchases').select('stripe_payment_intent_id,subtotal_nok,service_fee_nok').eq('id', purchaseId).single();
  if (error || !purchase) throw error || new Error('Fant ikke kjøpet.');
  const intentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
  if (!intentId || intentId !== purchase.stripe_payment_intent_id || refund.currency !== 'nok' || refund.amount !== (Number(purchase.subtotal_nok) + Number(purchase.service_fee_nok)) * 100) throw new Error('Refusjonen stemmer ikke med kjøpet.');
  const { error: syncError } = await admin.rpc('system_finalize_online_course_refund', { p_purchase_id: purchaseId, p_refund_id: refund.id, p_refund_status: refund.status || 'pending' });
  if (syncError) throw syncError;
  if (refund.status === 'succeeded') await notifyCoursePurchaseEvent(`course-refunded/${purchaseId}`);
  return refund.status;
}

export async function refundOnlineCoursePurchase(purchaseId: string) {
  const admin = createAdminClient();
  const { data: purchase, error } = await admin.from('online_course_purchases').select('id,status,payment_status,stripe_payment_intent_id,stripe_refund_id,subtotal_nok,service_fee_nok').eq('id', purchaseId).single();
  if (error || !purchase) throw error || new Error('Fant ikke kjøpet.');
  if (purchase.payment_status === 'refunded') { await notifyCoursePurchaseEvent(`course-refunded/${purchaseId}`); return 'succeeded'; }
  if (purchase.status !== 'active' || purchase.payment_status !== 'captured' || !purchase.stripe_payment_intent_id) throw new Error('Kjøpet kan ikke refunderes.');
  const stripe = getStripe();
  if (purchase.stripe_refund_id) return syncOnlineCourseRefund(purchase.stripe_refund_id);
  const { data: claimed, error: claimError } = await admin.rpc('system_claim_online_course_refund', { p_purchase_id: purchaseId });
  if (claimError) throw claimError;
  if (!claimed) throw new Error('Refusjonen behandles allerede. Prøv igjen om litt.');
  try {
    // Recover a previously created refund after a crash or an expired Stripe
    // idempotency key. Always refund the full original amount, never a remainder.
    const existing = await stripe.refunds.list({ payment_intent: purchase.stripe_payment_intent_id, limit: 100 });
    const prior = existing.data.find(r => r.metadata?.online_course_purchase_id === purchaseId);
    if (!prior && existing.data.length) throw new Error('Betalingen har allerede en refusjon. Kontakt kundeservice.');
    const refund = prior || await stripe.refunds.create({ payment_intent: purchase.stripe_payment_intent_id, amount: (Number(purchase.subtotal_nok) + Number(purchase.service_fee_nok)) * 100, metadata: { online_course_purchase_id: purchaseId } }, { idempotencyKey: `online-course-full-refund/${purchaseId}` });
    return await syncOnlineCourseRefund(refund.id);
  } finally {
    await admin.from('online_course_purchases').update({ refund_locked_until: null }).eq('id', purchaseId);
  }
}
