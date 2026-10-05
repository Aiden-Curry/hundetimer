'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bestEffortNotification } from '@/lib/notifications/server';

function clampText(value: FormDataEntryValue | null, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

export async function submitReviewAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  const rating = Number(formData.get('rating'));
  const comment = clampText(formData.get('comment'));
  if (!bookingId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent('Velg en vurdering fra 1 til 5 stjerner.')}`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/booking/${bookingId}`)}`);

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from('bookings')
    .select('id, customer_id, trainer_id, service_id, status, payment_status')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent('Du kan ikke vurdere denne bestillingen.')}`);
  }
  if (booking.status !== 'completed' || booking.payment_status !== 'captured') {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent('Du kan gi en vurdering etter at timen er fullført.')}`);
  }

  const { data: existing } = await admin.from('reviews').select('id, customer_id').eq('booking_id', bookingId).maybeSingle();
  if (existing && existing.customer_id !== user.id) {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent('Denne bestillingen har allerede en vurdering.')}`);
  }

  const payload = {
    booking_id: booking.id,
    customer_id: user.id,
    trainer_id: booking.trainer_id,
    service_id: booking.service_id,
    rating,
    comment: comment || null,
    updated_at: new Date().toISOString(),
  };

  const result = existing
    ? await admin.from('reviews').update(payload).eq('id', existing.id)
    : await admin.from('reviews').insert(payload);

  if (result.error) {
    redirect(`/booking/${bookingId}?error=${encodeURIComponent('Kunne ikke lagre vurderingen. Prøv igjen.')}`);
  }

  if (!existing) {
    await bestEffortNotification({
      userId: booking.trainer_id,
      type: 'review',
      title: `Ny ${rating}-stjerners vurdering`,
      body: comment || 'En kunde har lagt igjen en ny vurdering etter en fullført time.',
      href: '/trainer-dashboard',
      eventKey: `review-created/${bookingId}`,
      metadata: { booking_id: bookingId, rating },
    });
  }

  revalidatePath(`/booking/${bookingId}`);
  revalidatePath('/account');
  redirect(`/booking/${bookingId}?updated=${encodeURIComponent(existing ? 'Vurderingen er oppdatert.' : 'Takk for vurderingen!')}`);
}

export async function replyToReviewAction(formData: FormData) {
  const reviewId = String(formData.get('reviewId') || '');
  const reply = clampText(formData.get('reply'));
  if (!reviewId) redirect('/trainer-dashboard/reviews?error=Ugyldig+vurdering');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/reviews');

  const admin = createAdminClient();
  const { data: review } = await admin.from('reviews').select('id, trainer_id, customer_id, booking_id').eq('id', reviewId).maybeSingle();
  if (!review || review.trainer_id !== user.id) {
    redirect('/trainer-dashboard/reviews?error=Du+kan+ikke+svare+på+denne+vurderingen');
  }

  const { error } = await admin.from('reviews').update({
    trainer_reply: reply || null,
    trainer_replied_at: reply ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', reviewId);

  if (error) redirect('/trainer-dashboard/reviews?error=Kunne+ikke+lagre+svaret');
  if (reply) {
    await bestEffortNotification({
      userId: review.customer_id,
      type: 'review',
      title: 'Treneren svarte på vurderingen din',
      body: reply,
      href: `/booking/${review.booking_id}`,
      eventKey: `review-reply/${review.id}/${Date.now()}`,
      metadata: { review_id: review.id },
    });
  }
  revalidatePath('/trainer-dashboard/reviews');
  revalidatePath('/trainer-dashboard');
  redirect('/trainer-dashboard/reviews?message=Svar+på+vurdering+er+lagret');
}
