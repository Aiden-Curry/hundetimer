import { getTrainerJourney } from '@/lib/trainer-journey-server';
import { stripePayoutReady } from '@/lib/trainer-journey';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, siteUrl } from '@/lib/stripe/server';
import { connectedAccountStatus, syncConnectedAccount } from '@/lib/stripe/sync';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/trainer-dashboard/verification`);

  const journey = await getTrainerJourney();
  if (!journey || journey.error || !['stripe', 'ready'].includes(journey.stage)) {
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard/verification`);
  }

  const { data: payment } = await supabase
    .from('trainer_payment_accounts')
    .select('stripe_account_id')
    .eq('trainer_id', user.id)
    .maybeSingle();

  if (!payment?.stripe_account_id) {
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard/verification?error=${encodeURIComponent('Fant ikke Stripe-kontoen.')}`);
  }

  try {
    const account = await getStripe().v2.core.accounts.retrieve(payment.stripe_account_id, {
      include: ['configuration.recipient', 'requirements'],
    });

    const status = connectedAccountStatus(account);
    await syncConnectedAccount(account, user.id);

    const ok = stripePayoutReady({
      stripe_account_id: account.id,
      details_submitted: status.detailsSubmitted,
      payouts_enabled: status.payoutsEnabled,
      transfers_active: status.transfersActive,
    });

    return NextResponse.redirect(
      `${siteUrl()}/trainer-dashboard/verification?message=${encodeURIComponent(
        ok
          ? 'Stripe er koblet til og klar for utbetalinger.'
          : 'Stripe-oppsettet er lagret. Det kan fortsatt mangle noen opplysninger.',
      )}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kunne ikke oppdatere Stripe-status.';
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard/verification?error=${encodeURIComponent(message)}`);
  }
}
