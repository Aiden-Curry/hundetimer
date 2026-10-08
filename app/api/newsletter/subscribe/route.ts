import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const CONSENT_VERSION = 'platform-newsletter-2026-10';
const CONSENT_TEXT = 'Jeg samtykker til markedsføring på e-post fra Hundetimer og kan melde meg av når som helst.';

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) return NextResponse.json({ error: 'Skriv inn navnet ditt (maks 100 tegn).' }, { status: 400 });
  if (!validEmail(email)) return NextResponse.json({ error: 'Skriv inn en gyldig e-postadresse.' }, { status: 400 });

  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const accountMatches = Boolean(user?.email && user.email.toLowerCase() === email);

  const { data: existing } = await admin
    .from('newsletter_subscriptions')
    .select('id,user_id,name,source')
    .eq('scope', 'platform')
    .ilike('email', email)
    .maybeSingle();

  if (existing?.user_id && (!accountMatches || existing.user_id !== user?.id)) {
    // Do not let an anonymous request reactivate or modify a subscription that
    // is already tied to somebody else's authenticated Hundetimer account.
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();
  const row = {
    email,
    name,
    user_id: accountMatches && user ? user.id : existing?.user_id || null,
    source: accountMatches && user ? 'account' : 'website',
    subscribed_at: now,
    unsubscribed_at: null,
    consent_version: CONSENT_VERSION,
    consent_text: CONSENT_TEXT,
    updated_at: now,
  };

  const result = existing
    ? await admin.from('newsletter_subscriptions').update(row).eq('id', existing.id)
    : await admin.from('newsletter_subscriptions').insert({ scope: 'platform', trainer_id: null, ...row });

  if (result.error) return NextResponse.json({ error: 'Kunne ikke lagre påmeldingen akkurat nå.' }, { status: 500 });

  if (accountMatches && user) {
    const { data: preferences } = await admin.from('privacy_preferences').select('user_id').eq('user_id', user.id).maybeSingle();
    if (preferences) {
      await admin.from('privacy_preferences').update({ marketing_email: true, updated_at: now }).eq('user_id', user.id);
    } else {
      await admin.from('privacy_preferences').insert({ user_id: user.id, marketing_email: true, product_updates: false, analytics_consent: false, updated_at: now });
    }
  }

  return NextResponse.json({ ok: true });
}
