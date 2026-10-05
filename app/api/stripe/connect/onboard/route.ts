import { getTrainerJourney } from '@/lib/trainer-journey-server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, siteUrl } from '@/lib/stripe/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/trainer-dashboard/verification`);

  const journey = await getTrainerJourney();
  if (!journey || journey.error || !['stripe', 'ready'].includes(journey.stage)) {
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard/verification`);
  }
  const trainer = journey.trainer;

  const { data: payment } = await supabase
    .from('trainer_payment_accounts')
    .select('stripe_account_id')
    .eq('trainer_id', user.id)
    .maybeSingle();

  try {
    const stripe = getStripe();
    const admin = createAdminClient();
    let accountId = payment?.stripe_account_id || null;

    if (!accountId) {
      // Stripe recommends Accounts v2 for new Connect integrations.
      // Hundetimer is the platform/Merchant of Record for these payments and
      // trainers receive their share through transfers, so trainers only need
      // the Recipient configuration.
      const account = await stripe.v2.core.accounts.create({
        contact_email: user.email || undefined,
        display_name: trainer?.business_name || undefined,
        identity: {
          country: 'NO',
        },
        dashboard: 'express',
        defaults: {
          locales: ['nb-NO'],
          profile: {
            product_description: `Hundetrening via Hundetimer${trainer?.business_name ? ` - ${trainer.business_name}` : ''}`,
          },
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application',
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  requested: true,
                },
              },
            },
          },
        },
        metadata: {
          trainer_id: user.id,
        },
        include: ['configuration.recipient', 'requirements'],
      });

      accountId = account.id;

      const { error: saveError } = await admin.from('trainer_payment_accounts').upsert({
        trainer_id: user.id,
        stripe_account_id: accountId,
        details_submitted: false,
        payouts_enabled: false,
        transfers_active: false,
        updated_at: new Date().toISOString(),
      });
      if (saveError) throw saveError;
    }

    // Accounts v2 uses the v2 Account Links endpoint for hosted onboarding.
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: `${siteUrl()}/api/stripe/connect/onboard`,
          return_url: `${siteUrl()}/api/stripe/connect/return`,
        },
      },
    });

    return NextResponse.redirect(link.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kunne ikke starte Stripe-oppsettet.';
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard/verification?error=${encodeURIComponent(message)}`);
  }
}
