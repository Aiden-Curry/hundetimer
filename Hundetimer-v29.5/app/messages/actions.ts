'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notifyNewBookingMessage } from '@/lib/email/message-notifications';

export async function sendBookingMessageAction(bookingId: string, body: string) {
  const text = body.trim();
  if (!bookingId) throw new Error('Bestillingen mangler.');
  if (!text) throw new Error('Skriv en melding.');
  if (text.length > 2000) throw new Error('Meldingen kan være maks 2000 tegn.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Du må være logget inn.');

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, customer_id, trainer_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking || ![booking.customer_id, booking.trainer_id].includes(user.id)) throw new Error('Du har ikke tilgang til denne samtalen.');

  const { data: message, error } = await supabase.rpc('send_booking_message', { p_booking_id: bookingId, p_body: text });
  if (error) throw error;
  if (!message) throw new Error('Meldingen kunne ikke lagres.');

  await notifyNewBookingMessage(message.id);
  revalidatePath('/messages');
  revalidatePath(`/messages/${bookingId}`);
  return message;
}

export async function markBookingMessagesReadAction(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.rpc('mark_booking_messages_read', { p_booking_id: bookingId });
  revalidatePath('/messages');
}
