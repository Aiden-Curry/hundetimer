import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, siteUrl } from '@/lib/stripe/server';
import { notifyPendingWaitlistOffers } from '@/lib/email/waitlist-notifications';
import { releasePromotionForPurchase } from '@/lib/promotions/server';

export async function GET(request: NextRequest) {
  const enrollmentId = request.nextUrl.searchParams.get('enrollment');
  if (!enrollmentId) return NextResponse.redirect(`${siteUrl()}/activities`);
  const admin = createAdminClient();
  const { data: enrollment } = await admin.from('group_enrollments').select('id, offering_id, stripe_checkout_session_id, status').eq('id', enrollmentId).maybeSingle();
  if (enrollment?.status === 'checkout_pending' && enrollment.stripe_checkout_session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(enrollment.stripe_checkout_session_id);
      if (session.status === 'open') await getStripe().checkout.sessions.expire(session.id);
    } catch { /* webhook/RPC below still releases the seat */ }
    await releasePromotionForPurchase('group', enrollmentId);
    await admin.rpc('system_expire_group_checkout', { p_enrollment_id: enrollmentId });
    await notifyPendingWaitlistOffers(enrollment.offering_id);
  }
  return NextResponse.redirect(`${siteUrl()}/activities/${enrollment?.offering_id || ''}?error=${encodeURIComponent('Betalingen ble avbrutt. Hvis dette var en ventelisteplass, beholder du prioriteten så lenge tilbudet fortsatt gjelder.')}`);
}
