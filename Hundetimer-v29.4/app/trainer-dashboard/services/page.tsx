import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ServiceManager } from '@/components/service-manager';
import { createClient } from '@/lib/supabase/server';

export default async function TrainerServicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/services');

  const [{ data: account }, { data: trainer }, { data: services }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('slug').eq('id', user.id).maybeSingle(),
    supabase.from('services').select('id, title, description, duration_minutes, price_nok, booking_mode, delivery_mode, slot_interval_minutes, active').eq('trainer_id', user.id).order('created_at'),
  ]);
  if (account?.role !== 'trainer' || !trainer) redirect('/trainer-onboarding');

  return (
    <main className="dashboard editor-page">
      <section className="dashboard-heading">
        <div><Link className="back-link compact-back" href="/trainer-dashboard">← Tilbake til dashbord</Link><span className="eyebrow">Tjenester</span><h1>Administrer tjenester</h1><p className="muted">Legg til nye tjenester, endre priser og bestem hva kunder kan bestille.</p></div>
        <Link className="btn secondary" href={`/trainers/${trainer.slug}`}>Se offentlig profil</Link>
      </section>
      <ServiceManager initialServices={(services || []) as any} />
      <section className="notice service-availability-note"><strong>Tilgjengelighet styres fortsatt i hoveddashbordet.</strong><br />Når du endrer varighet eller intervall, regenererer systemet åpne tider automatisk fra de ukentlige reglene dine.</section>
    </main>
  );
}
