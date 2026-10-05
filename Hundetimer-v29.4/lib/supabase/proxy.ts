import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
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
  const { data: profile } = await supabase.from('profiles').select('account_status').eq('id', user.id).maybeSingle();
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

  return response;
}
