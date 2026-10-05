'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeCheckoutConfigured, siteUrl } from '@/lib/stripe/server';
import { syncGroupPaymentIntent } from '@/lib/stripe/group-sync';
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
  const confirmationTokenId = String(formData.get('confirmationTokenId') || '');
  if (!offeringId) return { ok: false, error: 'Fant ikke aktiviteten.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Økten din har utløpt. Logg inn igjen og prøv på nytt.' };
  if (!isStripeCheckoutConfigured()) return { ok: false, error: 'Stripe er ikke konfigurert ennå.' };
  if (!confirmationTokenId) return { ok: false, error: 'Kortopplysningene mangler. Prøv igjen.' };

  let enrollmentId: string | null = null;
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
    const totalNok = enrollment.subtotal_nok + enrollment.service_fee_nok;
    if (totalNok <= 0) throw new Error('Beløpet kan ikke betales med Stripe.');

    const returnUrl = `${siteUrl()}/activity-booking/${enrollment.id}?payment=success`;
    const intent = await getStripe().paymentIntents.create({
      amount: totalNok * 100,
      currency: 'nok',
      confirm: true,
      confirmation_token: confirmationTokenId,
      payment_method_types: ['card'],
      receipt_email: user.email || undefined,
      return_url: returnUrl,
      description: `${offering.title}${trainer?.business_name ? ` · ${trainer.business_name}` : ''}`,
      metadata: { purchase_type: 'group', group_enrollment_id: enrollment.id, offering_id: enrollment.offering_id, trainer_id: offering.trainer_id },
    });

    await createAdminClient().from('group_enrollments').update({
      stripe_payment_intent_id: intent.id,
      stripe_checkout_session_id: null,
    }).eq('id', enrollment.id);
    if (intent.status === 'succeeded') await syncGroupPaymentIntent(intent);

    return { ok: true, status: intent.status, clientSecret: intent.client_secret || undefined, totalNok, referenceId: enrollment.id, returnUrl: `/activity-booking/${enrollment.id}?payment=success` };
  } catch (error) {
    if (enrollmentId) {
      try {
        await releasePromotionForPurchase('group', enrollmentId);
        await createAdminClient().rpc('system_expire_group_checkout', { p_enrollment_id: enrollmentId });
        await notifyPendingWaitlistOffers(offeringId);
      } catch { /* best effort */ }
    }
    return { ok: false, error: messageOf(error) };
  }
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
