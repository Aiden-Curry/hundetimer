import { safeAuthNext } from '@/lib/auth-next';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeAuthNext(searchParams.get('next'), type === 'recovery' ? '/reset-password' : '/');
  const recovery = type === 'recovery' || new URL(next, origin).pathname === '/reset-password';

  try {
    if (token_hash && type) {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } else if (code) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  } catch {
    // Invalid links and authentication failures use the same safe error destination.
  }

  return NextResponse.redirect(`${origin}${recovery ? '/forgot-password?error=recovery' : '/login?error=callback'}`);
}
