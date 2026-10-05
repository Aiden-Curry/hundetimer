export type JourneyInput = {
  role?: string | null;
  status?: string | null;
  agreementSent?: boolean;
  trainerSigned?: boolean;
  platformSigned?: boolean;
  payment?: { stripe_account_id?: string | null; details_submitted?: boolean; payouts_enabled?: boolean; transfers_active?: boolean } | null;
};

export function stripePayoutReady(payment: JourneyInput['payment']) {
  return Boolean(payment?.stripe_account_id && payment.details_submitted && payment.payouts_enabled && payment.transfers_active);
}

export type TrainerJourneyStage = 'application' | 'review' | 'sign' | 'countersign' | 'approval' | 'stripe' | 'ready' | 'rejected' | 'suspended';

export function trainerJourneyStage(input: JourneyInput): TrainerJourneyStage {
  if (input.status === 'suspended') return 'suspended';
  if (input.status === 'rejected') return 'rejected';
  if (!input.status || input.status === 'not_submitted') return 'application';
  if (!input.agreementSent && !input.trainerSigned && input.status !== 'approved') return 'review';
  if (!input.trainerSigned) return 'sign';
  if (!input.platformSigned) return 'countersign';
  if (input.status !== 'approved' || input.role !== 'trainer') return 'approval';
  return stripePayoutReady(input.payment) ? 'ready' : 'stripe';
}
