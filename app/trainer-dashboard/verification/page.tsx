import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTrainerJourney } from '@/lib/trainer-journey-server';
import { TrainerJourney } from '@/components/trainer-journey';

export default async function TrainerVerificationPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const journey = await getTrainerJourney();
  if (!journey) redirect('/login?next=/trainer-dashboard/verification');
  const params = await searchParams;
  return <main className="page-shell journey-page"><Link className="back-link" href="/account">← Til Min side</Link><header><h1>Din vei til trenertilgang</h1><p>Søknad, avtale og utbetaling – samlet på den vanlige Hundetimer-kontoen din.</p></header>{params.message && <p className="notice success" role="status">{params.message}</p>}{params.error && <p className="notice error" role="alert">{params.error}</p>}<TrainerJourney journey={journey} /></main>;
}
