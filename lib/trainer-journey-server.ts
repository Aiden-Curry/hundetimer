import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { TRAINER_AGREEMENT_VERSION } from '@/lib/legal/trainer-agreement';
import { trainerJourneyStage } from './trainer-journey';

export const getTrainerJourney = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile, trainer, submission, agreement, payment] = await Promise.all([
    supabase.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('business_name,slug,verification_status,verification_review_note').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_verification_submissions').select('id,status,submitted_at,agreement_sent_at,admin_note').eq('trainer_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('trainer_agreement_acceptances').select('id,trainer_signed_at,admin_signed_at').eq('trainer_id', user.id).eq('agreement_version', TRAINER_AGREEMENT_VERSION).maybeSingle(),
    supabase.from('trainer_payment_accounts').select('stripe_account_id,details_submitted,payouts_enabled,transfers_active').eq('trainer_id', user.id).maybeSingle(),
  ]);
  const error = [profile, trainer, submission, agreement, payment].some(result => result.error);
  const stage = trainerJourneyStage({ role: profile.data?.role, status: trainer.data?.verification_status, agreementSent: Boolean(submission.data?.agreement_sent_at), trainerSigned: Boolean(agreement.data?.trainer_signed_at), platformSigned: Boolean(agreement.data?.admin_signed_at), payment: payment.data });
  return { user, profile: profile.data, trainer: trainer.data, submission: submission.data, agreement: agreement.data, payment: payment.data, stage, error };
});
