'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeConfigured, siteUrl } from '@/lib/stripe/server';
import { notifyWaitlistJoined, notifyPendingWaitlistOffers } from '@/lib/email/waitlist-notifications';
import { revalidatePath } from 'next/cache';
import { applyPromotionToPurchase, releasePromotionForPurchase } from '@/lib/promotions/server';

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Noe gikk galt.');
  return 'Noe gikk galt.';
}

export async function bookGroupActivityAction(formData: FormData) {
  const offeringId = String(formData.get('offeringId') || '');
  const dogId = String(formData.get('dogId') || '');
  const note = String(formData.get('note') || '').trim();
  const promoCode = String(formData.get('promoCode') || '').trim();
  if (!offeringId) redirect('/activities');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/activities/${offeringId}`)}`);
  if (!isStripeConfigured()) redirect(`/activities/${offeringId}?error=${encodeURIComponent('Stripe er ikke konfigurert ennå.')}`);

  let enrollmentId: string | null = null;
  let checkoutUrl: string | null = null;
  try {
    const { data, error } = await supabase.rpc('create_group_checkout_enrollment', {
      p_offering_id: offeringId, p_dog_id: dogId, p_customer_note: note || null,
    });
    if (error) throw error;
    enrollmentId = String(data || '');
    if (!enrollmentId) throw new Error('Påmeldingen ble ikke opprettet.');
    if (promoCode) await applyPromotionToPurchase('group', enrollmentId, promoCode);

    const { data: enrollment, error: enrollmentError } = await supabase.from('group_enrollments')
.select('id, offering_id, subtotal_nok, service_fee_nok, discount_nok, promotion_code')
      .eq('id', enrollmentId).single();
    if (enrollmentError || !enrollment) throw enrollmentError || new Error('Fant ikke påmeldingen.');
    const { data: offering, error: offeringError } = await supabase.from('group_offerings')
      .select('title, trainer_id').eq('id', enrollment.offering_id).single();
    if (offeringError || !offering) throw offeringError || new Error('Fant ikke aktiviteten.');
    const { data: trainer } = await supabase.from('trainer_profiles').select('business_name').eq('id', offering.trainer_id).maybeSingle();

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: user.email || undefined,
      line_items: [
        ...(enrollment.subtotal_nok > 0 ? [{ quantity: 1, price_data: { currency: 'nok', unit_amount: enrollment.subtotal_nok * 100, product_data: { name: offering.title, description: [trainer?.business_name, enrollment.promotion_code ? `Rabattkode ${enrollment.promotion_code}` : null].filter(Boolean).join(' · ') || undefined } } }] : []),
        ...(enrollment.service_fee_nok > 0 ? [{ quantity: 1, price_data: { currency: 'nok', unit_amount: enrollment.service_fee_nok * 100, product_data: { name: 'Servicegebyr' } } }] : []),
      ],
      payment_intent_data: {
        metadata: { purchase_type: 'group', group_enrollment_id: enrollment.id, offering_id: enrollment.offering_id, trainer_id: offering.trainer_id },
      },
      metadata: { purchase_type: 'group', group_enrollment_id: enrollment.id, offering_id: enrollment.offering_id, trainer_id: offering.trainer_id },
      success_url: `${siteUrl()}/activity-booking/${enrollment.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/api/stripe/group-checkout/cancel?enrollment=${enrollment.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await createAdminClient().from('group_enrollments').update({
      stripe_checkout_session_id: session.id,
      checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
    }).eq('id', enrollment.id);
    if (!session.url) throw new Error('Stripe returnerte ingen betalingsside.');
    checkoutUrl = session.url;
  } catch (error) {
    if (enrollmentId) {
      try {
        await releasePromotionForPurchase('group', enrollmentId);
        await createAdminClient().rpc('system_expire_group_checkout', { p_enrollment_id: enrollmentId });
        await notifyPendingWaitlistOffers(offeringId);
      } catch { /* best effort */ }
    }
    redirect(`/activities/${offeringId}?error=${encodeURIComponent(messageOf(error))}`);
  }
  redirect(checkoutUrl!);
}


export async function joinGroupWaitlistAction(formData: FormData) {
  const offeringId = String(formData.get('offeringId') || '');
  const dogId = String(formData.get('dogId') || '');
  const note = String(formData.get('note') || '').trim();
  if (!offeringId) redirect('/discover?type=activities');
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/activities/${offeringId}`)}`);
    const { data, error } = await supabase.rpc('join_group_waitlist', { p_offering_id:offeringId, p_dog_id:dogId, p_customer_note:note || null });
    if (error) throw error;
    if (!data) throw new Error('Kunne ikke legge deg på ventelisten.');
    await notifyWaitlistJoined(String(data));
    revalidatePath(`/activities/${offeringId}`);
    revalidatePath('/trainer-dashboard/groups');
  } catch (error) {
    redirect(`/activities/${offeringId}?error=${encodeURIComponent(messageOf(error))}`);
  }
  redirect(`/activities/${offeringId}?message=${encodeURIComponent('Du står nå på ventelisten. Vi gir deg beskjed når det blir din tur.')}`);
}

export async function withdrawGroupWaitlistAction(formData: FormData) {
  const offeringId = String(formData.get('offeringId') || '');
  const waitlistId = String(formData.get('waitlistId') || '');
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/activities/${offeringId}`)}`);
    const { error } = await supabase.rpc('withdraw_group_waitlist', { p_waitlist_id:waitlistId });
    if (error) throw error;
    await notifyPendingWaitlistOffers(offeringId);
    revalidatePath(`/activities/${offeringId}`);
    revalidatePath('/trainer-dashboard/groups');
  } catch (error) {
    redirect(`/activities/${offeringId}?error=${encodeURIComponent(messageOf(error))}`);
  }
  redirect(`/activities/${offeringId}?message=${encodeURIComponent('Du er fjernet fra ventelisten.')}`);
}
