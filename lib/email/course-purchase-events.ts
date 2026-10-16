import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/server';
import { sendTransactionalEmail } from '@/lib/email/server';

function escape(value: string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }

export async function notifyCoursePurchaseEvent(eventKey: string) {
  const admin = createAdminClient();
  const { data: event, error } = await admin.from('online_course_purchase_events').select('event_key,purchase_id,kind,reason,email_sent_at').eq('event_key', eventKey).maybeSingle();
  if (error) throw error;
  if (!event) return;
  const { data: purchase } = await admin.from('online_course_purchases').select('course_id,customer_id').eq('id', event.purchase_id).single();
  if (!purchase) throw new Error('Fant ikke kjøpet.');
  const { data: course } = await admin.from('online_courses').select('title').eq('id', purchase.course_id).single();
  if (!course) throw new Error('Fant ikke kurset.');
  const title = event.kind === 'refunded' ? 'Kjøpet ditt er refundert' : event.kind === 'revoked' ? 'Tilgangen til nettkurset er fjernet' : `Tilgangen til ${course.title} er gjenopprettet`;
  const body = event.kind === 'refunded' ? `Kjøpet av ${course.title} er refundert. Tilgangen til kurset er avsluttet.` : event.kind === 'revoked' ? `Tilgangen din til ${course.title} er fjernet av treneren.` : `Tilgangen til ${course.title} er gjenopprettet.`;
  await createNotification({ userId: purchase.customer_id, type: 'course', title, body, href: `/learn/${event.purchase_id}`, eventKey });
  if (event.kind === 'restored' || event.email_sent_at || !process.env.RESEND_API_KEY) return;
  const { data: auth, error: authError } = await admin.auth.admin.getUserById(purchase.customer_id);
  if (authError) throw authError;
  if (!auth.user?.email) return;
  const { data: claimed, error: claimError } = await admin.rpc('system_claim_course_event_email', { p_event_key: eventKey });
  if (claimError) throw claimError;
  if (!claimed) {
    const { data: current } = await admin.from('online_course_purchase_events').select('email_sent_at').eq('event_key', eventKey).single();
    if (current?.email_sent_at) return;
    throw new Error('E-postvarsling behandles. Prøv igjen om litt.');
  }
  try {
    const url = `${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/,'')}/learn/${event.purchase_id}`;
    await sendTransactionalEmail({ to: auth.user.email, subject: title, text: `${body}${event.reason ? ` Grunn: ${event.reason}` : ''} ${url}`, html: `<h1>${escape(title)}</h1><p>${escape(body)}</p>${event.reason ? `<p>Grunn: ${escape(event.reason)}</p>` : ''}<p><a href="${escape(url)}">Se kjøpet</a></p>`, idempotencyKey: eventKey });
    const { error: sentError } = await admin.from('online_course_purchase_events').update({ email_sent_at: new Date().toISOString() }).eq('event_key', eventKey);
    if (sentError) throw sentError;
  } catch (error) {
    await admin.from('online_course_purchase_events').update({ email_locked_until: null }).eq('event_key', eventKey);
    throw error;
  }
}
