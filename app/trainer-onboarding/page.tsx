import { redirect } from 'next/navigation';

// Compatibility route: applications, contracts and payout setup now share one journey.
export default function TrainerOnboardingPage() {
  redirect('/trainer-dashboard/verification');
}
