import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTrainerJourney } from '@/lib/trainer-journey-server';
import { TrainerDashboardSidebar } from '@/components/trainer-dashboard-sidebar';
import './workspace.css';

export default async function TrainerDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-hundetimer-pathname');
  const journey = await getTrainerJourney();
  if (!journey) redirect(`/login?next=${encodeURIComponent(pathname?.startsWith('/trainer-dashboard') ? pathname : '/trainer-dashboard')}`);
  // Applicants must be able to see status before receiving the trainer role.
  if (pathname === '/trainer-dashboard/verification') return <>{children}</>;
  if (journey.error || journey.stage !== 'ready') redirect('/trainer-dashboard/verification');
  const businessName = journey.trainer?.business_name || journey.profile?.display_name || 'Trener';
  return <div className="trainer-app-shell"><TrainerDashboardSidebar businessName={businessName} publicHref={journey.trainer?.slug ? `/trainers/${journey.trainer.slug}` : null} verificationStatus={journey.trainer?.verification_status || 'approved'} /><div className="trainer-app-content">{children}</div></div>;
}
