import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { microsoftAuthorizationUrl } from '@/lib/calendar/microsoft';
import { microsoftConfigured } from '@/lib/calendar/config';

export async function GET() {
  if (!microsoftConfigured()) return NextResponse.redirect(new URL('/trainer-dashboard/calendar?error=Outlook+Calendar+er+ikke+konfigurert', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/trainer-dashboard/calendar', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'trainer') return NextResponse.redirect(new URL('/account', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));
  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(microsoftAuthorizationUrl(state));
  response.cookies.set('calendar_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' });
  response.cookies.set('calendar_oauth_provider', 'microsoft', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' });
  return response;
}
