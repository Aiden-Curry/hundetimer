import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeGoogleCode, googleAccountEmail } from '@/lib/calendar/google';
import { saveCalendarConnection, syncFutureConfirmedBookings, syncTrainerBusyTime } from '@/lib/calendar/server';
import { siteUrl } from '@/lib/calendar/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = request.cookies.get('calendar_oauth_state')?.value;
  const provider = request.cookies.get('calendar_oauth_provider')?.value;
  if (!code || !state || state !== expected || provider !== 'google') return NextResponse.redirect(`${siteUrl()}/trainer-dashboard/calendar?error=Ugyldig+Google+OAuth-svar`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/trainer-dashboard/calendar`);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'trainer') return NextResponse.redirect(`${siteUrl()}/account`);
  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) throw new Error('Google returnerte ingen refresh token. Prøv å koble til på nytt og godta tilgangen.');
    const email = await googleAccountEmail(tokens.access_token);
    await saveCalendarConnection({ trainerId: user.id, provider: 'google', refreshToken: tokens.refresh_token, accountEmail: email });
    await syncTrainerBusyTime(user.id).catch(() => null);
    await syncFutureConfirmedBookings(user.id).catch(() => null);
    const response = NextResponse.redirect(`${siteUrl()}/trainer-dashboard/calendar?message=Google+Kalender+er+koblet+til`);
    response.cookies.delete('calendar_oauth_state'); response.cookies.delete('calendar_oauth_provider');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google-tilkoblingen feilet.';
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard/calendar?error=${encodeURIComponent(message)}`);
  }
}
