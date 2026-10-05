import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, siteUrl } from '@/lib/stripe/server';
import { releasePromotionForPurchase } from '@/lib/promotions/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('booking');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login`);
  if (!bookingId) return NextResponse.redirect(`${siteUrl()}/browse`);

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id, service_id, slot_id, stripe_checkout_session_id, payment_status')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.customer_id !== user.id) return NextResponse.redirect(`${siteUrl()}/account`);

  if (booking.payment_status === 'checkout_pending' && booking.stripe_checkout_session_id) {
    try { await getStripe().checkout.sessions.expire(booking.stripe_checkout_session_id); } catch { /* webhook/RPC still release */ }
  }

  try { await releasePromotionForPurchase('booking', booking.id); } catch {}
  try { await supabase.rpc('release_checkout_booking', { p_booking_id: booking.id }); } catch { /* ignore */ }

  return NextResponse.redirect(`${siteUrl()}/book/${booking.service_id}?slot=${booking.slot_id || ''}&payment=cancelled`);
}
