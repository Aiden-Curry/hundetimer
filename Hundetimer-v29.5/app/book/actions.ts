'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeConfigured, siteUrl } from '@/lib/stripe/server';
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

  if (!serviceId || !slotId) redirect('/discover?type=trainers');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/book/${serviceId}?slot=${slotId}`)}`);

  if (!isStripeConfigured()) {
    redirect(`/book/${serviceId}?slot=${slotId}&error=${encodeURIComponent('Stripe er ikke konfigurert ennå.')}`);
  }

  let bookingId: string | null = null;
  let checkoutUrl: string | null = null;

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
      supabase.from('services').select('title').eq('id', booking.service_id).single(),
      supabase.from('trainer_profiles').select('business_name').eq('id', booking.trainer_id).single(),
    ]);

    const totalNok = booking.subtotal_nok + booking.service_fee_nok;
    if (totalNok <= 0) throw new Error('Beløpet kan ikke betales med Stripe.');

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: user.email || undefined,
      line_items: [
        ...(booking.subtotal_nok > 0 ? [{
          quantity: 1,
          price_data: {
            currency: 'nok',
            unit_amount: booking.subtotal_nok * 100,
            product_data: { name: service?.title || 'Hundetrening', description: [trainer?.business_name, booking.promotion_code ? `Rabattkode ${booking.promotion_code}` : null].filter(Boolean).join(' · ') || undefined },
          },
        }] : []),
        ...(booking.service_fee_nok > 0 ? [{
          quantity: 1,
          price_data: {
            currency: 'nok',
            unit_amount: booking.service_fee_nok * 100,
            product_data: { name: 'Servicegebyr' },
          },
        }] : []),
      ],
      payment_intent_data: {
        capture_method: 'manual',
        metadata: { booking_id: booking.id, trainer_id: booking.trainer_id, service_id: booking.service_id },
      },
      metadata: { booking_id: booking.id, trainer_id: booking.trainer_id, service_id: booking.service_id },
      success_url: `${siteUrl()}/booking/${booking.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/api/stripe/checkout/cancel?booking=${booking.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    const admin = createAdminClient();
    await admin.from('bookings').update({
      stripe_checkout_session_id: session.id,
      payment_hold_expires_at: new Date(session.expires_at * 1000).toISOString(),
    }).eq('id', booking.id);

    checkoutUrl = session.url;
    if (!checkoutUrl) throw new Error('Stripe returnerte ingen betalingsside.');
  } catch (error) {
    if (bookingId) {
      try { await releasePromotionForPurchase('booking', bookingId); } catch { /* best effort */ }
      try { await supabase.rpc('release_checkout_booking', { p_booking_id: bookingId }); } catch { /* best effort */ }
    }
    redirect(`/book/${serviceId}?slot=${slotId}&error=${encodeURIComponent(messageOf(error))}`);
  }

  redirect(checkoutUrl!);
}
