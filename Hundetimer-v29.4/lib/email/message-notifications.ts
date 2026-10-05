import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';
import { bestEffortNotification } from '@/lib/notifications/server';

const BRAND = process.env.EMAIL_BRAND_NAME?.trim() || 'Hundetimer';
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
}

export async function notifyNewBookingMessage(messageId: string) {
  try {
    const admin = createAdminClient();
    const { data: message, error } = await admin
      .from('booking_messages')
      .select('id, booking_id, sender_id, body, created_at')
      .eq('id', messageId)
      .maybeSingle();
    if (error) throw error;
    if (!message) return;

    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, customer_id, trainer_id, service_id, dog_name')
      .eq('id', message.booking_id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return;

    const recipientId = message.sender_id === booking.customer_id ? booking.trainer_id : booking.customer_id;
    const [senderProfile, recipientAuth, service, trainerProfile] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', message.sender_id).maybeSingle(),
      admin.auth.admin.getUserById(recipientId),
      admin.from('services').select('title').eq('id', booking.service_id).maybeSingle(),
      admin.from('trainer_profiles').select('business_name').eq('id', booking.trainer_id).maybeSingle(),
    ]);

    const senderName = message.sender_id === booking.trainer_id
      ? (trainerProfile.data?.business_name || senderProfile.data?.display_name || 'Treneren')
      : (senderProfile.data?.display_name || 'Kunden');
    const recipientEmail = recipientAuth.data.user?.email || null;
    const serviceTitle = service.data?.title || 'Hundetrening';
    const preview = message.body.trim().slice(0, 260);

    await bestEffortNotification({
      userId: recipientId,
      type: 'message',
      title: `Ny melding fra ${senderName}`,
      body: preview,
      href: `/messages/${booking.id}`,
      eventKey: `booking-message/${message.id}/${recipientId}`,
      metadata: { booking_id: booking.id, sender_id: message.sender_id },
    });

    // One email nudge per unread streak, so a quick chat does not create an email for every line.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: earlierUnread } = await admin
      .from('booking_messages')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('sender_id', message.sender_id)
      .is('read_at', null)
      .neq('id', message.id)
      .gte('created_at', fifteenMinutesAgo)
      .limit(1);
    if (earlierUnread?.length) return;
    const html = `<!doctype html><html lang="nb"><body style="margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:22px;padding:34px"><p style="margin:0 0 12px;color:#78826f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Ny melding</p><h1 style="font-size:28px;line-height:1.2;margin:0 0 16px">${escapeHtml(senderName)} har sendt deg en melding</h1><p style="font-size:15px;color:#666;margin:0 0 18px">${escapeHtml(serviceTitle)}${booking.dog_name ? ` · ${escapeHtml(booking.dog_name)}` : ''}</p><div style="padding:18px;background:#f7f5ef;border-radius:14px;font-size:16px;line-height:1.6">${escapeHtml(preview)}</div><p style="margin:26px 0"><a href="${BASE_URL}/messages/${booking.id}" style="display:inline-block;background:#20251f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">Åpne samtalen</a></p><p style="margin:0;color:#777;font-size:13px">Svar inne på ${escapeHtml(BRAND)} slik at bookinghistorikken og samtalen holdes samlet.</p></div></div></body></html>`;

    await sendTransactionalEmail({
      to: recipientEmail,
      subject: `Ny melding fra ${senderName}`,
      html,
      text: `${senderName} har sendt deg en melding om ${serviceTitle}: ${preview}\n\n${BASE_URL}/messages/${booking.id}`,
      idempotencyKey: `booking-message/${message.id}/${recipientId}`,
    });
  } catch (error) {
    console.error('[email] booking message', error);
  }
}
