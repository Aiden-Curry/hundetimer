import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';

export async function sendPrivateBookingEmail(options: Parameters<typeof sendTransactionalEmail>[0]) {
  // Do not reserve a delivery when email is unconfigured or the recipient is missing.
  if (!process.env.RESEND_API_KEY || !options.to) return { skipped: true as const };
  const admin = createAdminClient();
  const key = options.idempotencyKey;
  const { data: claimed, error } = await admin.rpc('claim_private_booking_email', { p_event_key: key });
  if (error) throw error;
  if (!claimed) {
    const { data: receipt, error: receiptError } = await admin.from('private_booking_email_deliveries').select('sent_at').eq('event_key', key).maybeSingle();
    if (receiptError) throw receiptError;
    if (receipt?.sent_at) return { skipped: true as const };
    // Keep the webhook retryable after a process interruption or concurrent claim.
    throw new Error(`Email delivery pending or requires reconciliation: ${key}`);
  }
  try {
    const result = await sendTransactionalEmail(options);
    const { error: receiptError } = await admin.from('private_booking_email_deliveries').update({ sent_at: new Date().toISOString() }).eq('event_key', key);
    if (receiptError) throw receiptError;
    return result;
  } catch (error) {
    // A retry uses the same provider key. Never retry an uncertain delivery after
    // its provider deduplication window; retain the row for manual reconciliation.
    await admin.from('private_booking_email_deliveries').update({ locked_until: new Date(0).toISOString() }).eq('event_key', key);
    throw error;
  }
}
