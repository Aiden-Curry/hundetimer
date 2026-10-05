import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, siteUrl } from '@/lib/stripe/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/trainer-dashboard`);

  const [{ data: profile }, { data: trainer }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('id, business_name, verification_status').eq('id', user.id).maybeSingle(),
  ]);

  if (profile?.role !== 'trainer' || !trainer || !['approved', 'suspended'].includes(trainer.verification_status || '')) {
    return NextResponse.redirect(`${siteUrl()}/bli-trener`);
  }

  const { data: payment } = await supabase.from('trainer_payment_accounts').select('stripe_account_id').eq('trainer_id', user.id).maybeSingle();

  try {
    const stripe = getStripe();
    const admin = createAdminClient();
    let accountId = payment?.stripe_account_id || null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        country: 'NO',
        email: user.email || undefined,
        controller: {
          fees: { payer: 'application' },
          losses: { payments: 'application' },
          stripe_dashboard: { type: 'express' },
        },
        capabilities: { transfers: { requested: true } },
        business_profile: {
          product_description: `Hundetrening via markedsplass${trainer.business_name ? ` - ${trainer.business_name}` : ''}`,
        },
        metadata: { trainer_id: user.id },
      });
      accountId = account.id;
      await admin.from('trainer_payment_accounts').upsert({ trainer_id: user.id, stripe_account_id: accountId, updated_at: new Date().toISOString() });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl()}/api/stripe/connect/onboard`,
      return_url: `${siteUrl()}/api/stripe/connect/return`,
      type: 'account_onboarding',
    });

    return NextResponse.redirect(link.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kunne ikke starte Stripe-oppsettet.';
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard?error=${encodeURIComponent(message)}`);
  }
}
