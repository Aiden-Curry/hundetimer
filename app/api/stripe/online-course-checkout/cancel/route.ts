import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, siteUrl } from '@/lib/stripe/server';
import { releasePromotionForPurchase } from '@/lib/promotions/server';

export async function GET(request: NextRequest) {
  const purchaseId = request.nextUrl.searchParams.get('purchase');
  const slug = request.nextUrl.searchParams.get('slug') || '';
  if (!purchaseId) return NextResponse.redirect(`${siteUrl()}/online-courses`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login`);

  const admin = createAdminClient();
  const { data: purchase } = await admin.from('online_course_purchases')
    .select('id,customer_id,stripe_checkout_session_id,status')
    .eq('id', purchaseId).maybeSingle();
  if (!purchase || purchase.customer_id !== user.id) return NextResponse.redirect(`${siteUrl()}/account`);

  if (purchase.status === 'checkout_pending' && purchase.stripe_checkout_session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(purchase.stripe_checkout_session_id);
      if (session.status === 'open') await getStripe().checkout.sessions.expire(session.id);
    } catch { /* expiration/RPC below is the source of truth */ }
    await releasePromotionForPurchase('online_course', purchaseId);
    await admin.rpc('system_expire_online_course_checkout', { p_purchase_id: purchaseId });
  }

  return NextResponse.redirect(`${siteUrl()}/online-courses/${slug}?error=${encodeURIComponent('Betalingen ble avbrutt.')}`);
}
