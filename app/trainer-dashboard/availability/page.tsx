import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AvailabilityManager } from '@/components/availability-manager';

export default async function TrainerAvailabilityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/availability');

  const [{ data: profile }, { data: services }, { data: availability }, { data: blocks }, { data: slots }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('services').select('id, title, duration_minutes, slot_interval_minutes').eq('trainer_id', user.id).eq('active', true).order('created_at'),
    supabase.from('weekly_availability').select('id, weekday, start_time, end_time, service_id').eq('trainer_id', user.id).eq('active', true).order('weekday'),
    supabase.from('availability_exceptions').select('id, service_id, starts_at, ends_at, note').eq('trainer_id', user.id).eq('kind', 'blocked').gte('ends_at', new Date().toISOString()).order('starts_at'),
    supabase.from('availability_slots').select('id, service_id, starts_at, ends_at').eq('trainer_id', user.id).eq('status', 'open').gte('starts_at', new Date().toISOString()).order('starts_at').limit(200),
  ]);

  if (profile?.role !== 'trainer') redirect('/');

  return (
    <main className="dashboard trainer-subpage">
      <section className="dashboard-heading trainer-subpage-heading">
        <div>
          <span className="eyebrow">Tilgjengelighet</span>
          <h1>Når kan kunder bestille?</h1>
          <p className="muted">Sett faste arbeidstider per tjeneste, blokker enkelttimer og generer ledige tider i markedsplassen.</p>
        </div>
      </section>
      {(services || []).length ? (
        <AvailabilityManager
          services={services || []}
          initialRules={availability || []}
          initialBlocks={blocks || []}
          initialSlots={slots || []}
        />
      ) : (
        <div className="empty-state"><h3>Du trenger en aktiv tjeneste først</h3><p className="muted">Opprett en privattime før du setter tilgjengelighet.</p><Link className="btn" href="/trainer-dashboard/services">Gå til tjenester</Link></div>
      )}
    </main>
  );
}
