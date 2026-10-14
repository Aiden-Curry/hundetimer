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
  if (journey.accessError || !['ready', 'stripe'].includes(journey.stage)) redirect('/trainer-dashboard/verification');
  const businessName = journey.trainer?.business_name || journey.profile?.display_name || 'Trener';
  return <div className="trainer-app-shell"><TrainerDashboardSidebar businessName={businessName} publicHref={journey.trainer?.slug ? `/trainers/${journey.trainer.slug}` : null} verificationStatus={journey.trainer?.verification_status || 'approved'} /><div className="trainer-app-content">{journey.stage === 'stripe' && <section className="notice" aria-label="Utbetalinger"><strong>Koble til Stripe for å kunne motta betalinger.</strong><p>Du kan gjøre klar profilen, tilbudene og kalenderen din nå. Betalte tilbud kan publiseres og bestilles når Stripe-kontoen er klar.</p><a className="btn secondary" href="/api/stripe/connect/onboard">Sett opp utbetaling hos Stripe</a></section>}{children}</div></div>;
}
