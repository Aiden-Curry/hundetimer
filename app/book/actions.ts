'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeCheckoutConfigured, siteUrl } from '@/lib/stripe/server';
import { syncBookingPaymentIntent } from '@/lib/stripe/sync';
import { applyPromotionToPurchase, releasePromotionForPurchase } from '@/lib/promotions/server';

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Noe gikk galt.');
  return 'Noe gikk galt.';
}

export async function requestBookingAction(formData: FormData) {
  const serviceId = String(formData.get('serviceId') || '');
  const slotId = String(formData.get('slotId') || '');
  const dogId = String(formData.get('dogId') || '');
  const note = String(formData.get('note') || '');
  const promoCode = String(formData.get('promoCode') || '').trim();
  const confirmationTokenId = String(formData.get('confirmationTokenId') || '');

  if (!serviceId || !slotId) return { ok: false, error: 'Velg et gyldig tidspunkt.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Økten din har utløpt. Logg inn igjen og prøv på nytt.' };
  if (!isStripeCheckoutConfigured()) return { ok: false, error: 'Stripe er ikke konfigurert ennå.' };
  if (!confirmationTokenId) return { ok: false, error: 'Kortopplysningene mangler. Prøv igjen.' };

  let bookingId: string | null = null;

  try {
    const { data, error } = await supabase.rpc('create_checkout_booking', {
      p_slot_id: slotId,
      p_dog_id: dogId,
      p_customer_note: note || null,
    });
    if (error) throw error;
    if (!data) throw new Error('Bestillingen ble ikke opprettet.');
    bookingId = String(data);
    if (promoCode) await applyPromotionToPurchase('booking', bookingId, promoCode);

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, trainer_id, service_id, subtotal_nok, service_fee_nok, platform_fee_nok, discount_nok, promotion_code')
      .eq('id', bookingId)
      .single();
    if (bookingError || !booking) throw bookingError || new Error('Fant ikke bestillingen.');

    const [{ data: service }, { data: trainer }] = await Promise.all([
      supabase.from('services').select('title,booking_mode').eq('id', booking.service_id).single(),
      supabase.from('trainer_profiles').select('business_name').eq('id', booking.trainer_id).single(),
    ]);

    const totalNok = booking.subtotal_nok + booking.service_fee_nok;
    if (totalNok <= 0) throw new Error('Beløpet kan ikke betales med Stripe.');

    const returnUrl = `${siteUrl()}/booking/${booking.id}?payment=success`;
    const intent = await getStripe().paymentIntents.create({
      amount: totalNok * 100,
      currency: 'nok',
      confirm: true,
      confirmation_token: confirmationTokenId,
      payment_method_types: ['card'],
      capture_method: 'manual',
      receipt_email: user.email || undefined,
      return_url: returnUrl,
      description: `${service?.title || 'Hundetrening'}${trainer?.business_name ? ` · ${trainer.business_name}` : ''}`,
      metadata: { booking_id: booking.id, trainer_id: booking.trainer_id, service_id: booking.service_id },
    });

    await createAdminClient().from('bookings').update({
      stripe_payment_intent_id: intent.id,
      stripe_checkout_session_id: null,
    }).eq('id', booking.id);

    let finalStatus = intent.status;
    let finalClientSecret = intent.client_secret || undefined;
    if (intent.status === 'requires_capture') {
      const synced = await syncBookingPaymentIntent(intent);
      if (synced && typeof synced !== 'string') {
        finalStatus = synced.status || finalStatus;
        finalClientSecret = synced.clientSecret || finalClientSecret;
      }
    }

    return { ok: true, status: finalStatus, clientSecret: finalClientSecret, totalNok, referenceId: booking.id, returnUrl: `/booking/${booking.id}?payment=success` };
  } catch (error) {
    if (bookingId) {
      try { await releasePromotionForPurchase('booking', bookingId); } catch { /* best effort */ }
      try { await supabase.rpc('release_checkout_booking', { p_booking_id: bookingId }); } catch { /* best effort */ }
    }
    return { ok: false, error: messageOf(error) };
  }
}
