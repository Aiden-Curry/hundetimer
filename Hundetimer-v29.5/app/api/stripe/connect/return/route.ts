import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, siteUrl } from '@/lib/stripe/server';
import { syncConnectedAccount } from '@/lib/stripe/sync';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/trainer-dashboard`);

  const [{ data: profile }, { data: trainer }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('verification_status').eq('id', user.id).maybeSingle(),
  ]);
  if (profile?.role !== 'trainer' || !trainer || !['approved', 'suspended'].includes(trainer.verification_status || '')) {
    return NextResponse.redirect(`${siteUrl()}/bli-trener`);
  }

  const { data: payment } = await supabase
    .from('trainer_payment_accounts')
    .select('stripe_account_id')
    .eq('trainer_id', user.id)
    .maybeSingle();

  if (!payment?.stripe_account_id) {
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard?error=${encodeURIComponent('Fant ikke Stripe-kontoen.')}`);
  }

  try {
    const account = await getStripe().accounts.retrieve(payment.stripe_account_id);
    await syncConnectedAccount(account);
    const ok = account.capabilities?.transfers === 'active';
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard?message=${encodeURIComponent(ok ? 'Stripe er koblet til og klar for utbetalinger.' : 'Stripe-oppsettet er lagret. Det kan fortsatt mangle noen opplysninger.')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kunne ikke oppdatere Stripe-status.';
    return NextResponse.redirect(`${siteUrl()}/trainer-dashboard?error=${encodeURIComponent(message)}`);
  }
}
