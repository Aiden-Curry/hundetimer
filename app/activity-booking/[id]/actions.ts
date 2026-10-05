'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { notifyGroupEnrollmentCancelled } from '@/lib/email/group-notifications';
import { notifyPendingWaitlistOffers } from '@/lib/email/waitlist-notifications';
import { releasePromotionForPurchase } from '@/lib/promotions/server';

function messageOf(error: unknown) { return error instanceof Error ? error.message : 'Noe gikk galt.'; }

export async function cancelGroupEnrollmentAction(formData: FormData) {
  const enrollmentId = String(formData.get('enrollmentId') || '');
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/account');
    const { data: enrollment, error } = await supabase.from('group_enrollments').select('*').eq('id', enrollmentId).maybeSingle();
    if (error || !enrollment || enrollment.customer_id !== user.id) throw error || new Error('Påmeldingen finnes ikke.');

    const admin = createAdminClient();
    if (enrollment.payment_status === 'captured' && enrollment.stripe_payment_intent_id) {
      const refund = enrollment.stripe_refund_id
        ? await getStripe().refunds.retrieve(enrollment.stripe_refund_id)
        : await getStripe().refunds.create({ payment_intent: enrollment.stripe_payment_intent_id, reason:'requested_by_customer', metadata:{ group_enrollment_id: enrollment.id } });
      await admin.rpc('system_update_group_refund', { p_enrollment_id: enrollment.id, p_refund_id: refund.id, p_refund_status: refund.status || 'pending' });
    } else if (enrollment.status === 'checkout_pending') {
      await releasePromotionForPurchase('group', enrollment.id);
      await admin.rpc('system_expire_group_checkout', { p_enrollment_id: enrollment.id });
    }

    const { error: cancelError } = await supabase.rpc('cancel_group_enrollment', { p_enrollment_id: enrollment.id });
    if (cancelError) throw cancelError;
    await notifyGroupEnrollmentCancelled(enrollment.id);
    await notifyPendingWaitlistOffers(enrollment.offering_id);
  } catch (error) {
    redirect(`/activity-booking/${enrollmentId}?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/account'); revalidatePath(`/activity-booking/${enrollmentId}`); revalidatePath('/activities');
  redirect(`/activity-booking/${enrollmentId}?message=Påmeldingen+er+avbestilt`);
}
