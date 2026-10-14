import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripePayoutReady } from '@/lib/trainer-journey';

// Read trusted, server-maintained Connect v2 flags. Fail closed on lookup errors.
export async function requireTrainerPaymentReady(trainerId: string) {
  const admin = createAdminClient();
  const [trainer, payment] = await Promise.all([
    admin.from('trainer_profiles').select('verification_status').eq('id', trainerId).maybeSingle(),
    admin.from('trainer_payment_accounts').select('stripe_account_id,details_submitted,payouts_enabled,transfers_active').eq('trainer_id', trainerId).maybeSingle(),
  ]);
  if (trainer.error || payment.error || trainer.data?.verification_status !== 'approved' || !stripePayoutReady(payment.data)) {
    throw new Error('Treneren kan ikke motta betalinger ennå. Prøv igjen senere.');
  }
}
