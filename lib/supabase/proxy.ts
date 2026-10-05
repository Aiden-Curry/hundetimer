import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { TRAINER_AGREEMENT_VERSION } from '@/lib/legal/trainer-agreement';
import { stripePayoutReady } from '@/lib/trainer-journey';

export async function updateSession(request: NextRequest) {
  // Always overwrite the incoming value; layouts use this only to choose the status route.
  request.headers.set('x-hundetimer-pathname', request.nextUrl.pathname);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return response;

  const pathname = request.nextUrl.pathname;
  const allowedWhileSuspended = pathname === '/account-suspended' || pathname.startsWith('/account/privacy') || pathname.startsWith('/auth/') || pathname === '/login';
  const { data: profile } = await supabase.from('profiles').select('account_status,role').eq('id', user.id).maybeSingle();
  if (profile?.account_status === 'deleted') {
    const next = NextResponse.redirect(new URL('/account-deleted', request.url));
    response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie.name, cookie.value));
    return next;
  }
  if (!allowedWhileSuspended && profile?.account_status === 'suspended') {
    const next = NextResponse.redirect(new URL('/account-suspended', request.url));
    response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie.name, cookie.value));
    return next;
  }

  // Check each navigation too: a shared layout may be reused by the client router.
  if ((pathname === '/trainer-dashboard' || pathname.startsWith('/trainer-dashboard/')) && pathname !== '/trainer-dashboard/verification') {
    const [trainer, agreement, payment] = await Promise.all([
      supabase.from('trainer_profiles').select('verification_status').eq('id', user.id).maybeSingle(),
      supabase.from('trainer_agreement_acceptances').select('trainer_signed_at,admin_signed_at').eq('trainer_id', user.id).eq('agreement_version', TRAINER_AGREEMENT_VERSION).maybeSingle(),
      supabase.from('trainer_payment_accounts').select('stripe_account_id,details_submitted,payouts_enabled,transfers_active').eq('trainer_id', user.id).maybeSingle(),
    ]);
    if (profile?.role !== 'trainer' || trainer.data?.verification_status !== 'approved' || !agreement.data?.trainer_signed_at || !agreement.data?.admin_signed_at || !stripePayoutReady(payment.data) || trainer.error || agreement.error || payment.error) {
      const next = NextResponse.redirect(new URL('/trainer-dashboard/verification', request.url));
      response.cookies.getAll().forEach(cookie => next.cookies.set(cookie.name, cookie.value));
      return next;
    }
  }

  return response;
}
