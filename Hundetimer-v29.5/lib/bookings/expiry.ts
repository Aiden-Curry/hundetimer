import { createAdminClient } from '@/lib/supabase/admin';
import { releaseOrRefundBookingPayment } from '@/lib/stripe/cancellation';
import { notifyBookingExpired } from '@/lib/email/notifications';
import { releasePromotionForPurchase } from '@/lib/promotions/server';

export async function expireOverdueTrainerResponses(options?: { trainerId?: string; bookingId?: string }) {
  const admin = createAdminClient();
  let query = admin
    .from('bookings')
    .select('id, trainer_id, status, payment_status, stripe_payment_intent_id, stripe_refund_id, refund_status, subtotal_nok, service_fee_nok, trainer_response_due_at')
    .eq('status', 'pending')
    .eq('payment_status', 'authorized')
    .not('trainer_response_due_at', 'is', null)
    .lte('trainer_response_due_at', new Date().toISOString())
    .limit(100);

  if (options?.trainerId) query = query.eq('trainer_id', options.trainerId);
  if (options?.bookingId) query = query.eq('id', options.bookingId);

  const { data: bookings, error } = await query;
  if (error) throw error;

  let expired = 0;
  const errors: { bookingId: string; message: string }[] = [];

  for (const booking of bookings || []) {
    try {
      await releaseOrRefundBookingPayment(booking, 'system');
      await releasePromotionForPurchase('booking', booking.id);
      const { error: expireError } = await admin.rpc('system_expire_trainer_response_booking', { p_booking_id: booking.id });
      if (expireError) throw expireError;
      await notifyBookingExpired(booking.id);
      expired += 1;
    } catch (error) {
      errors.push({ bookingId: booking.id, message: error instanceof Error ? error.message : 'Ukjent feil' });
    }
  }

  return { checked: (bookings || []).length, expired, errors };
}
