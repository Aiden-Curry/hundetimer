import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrainerOnboardingForm } from '@/components/trainer-onboarding-form';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export default async function TrainerOnboardingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell narrow">
        <section className="setup-card"><span className="eyebrow">Supabase mangler</span><h1>Treneroppsett trenger database</h1><p className="muted">Legg inn Supabase-verdiene i <code>.env.local</code> først.</p><Link className="btn" href="/">Til forsiden</Link></section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-onboarding');

  const { data: existingTrainer } = await supabase.from('trainer_profiles').select('id').eq('id', user.id).maybeSingle();
  if (existingTrainer) {
    const { count } = await supabase.from('services').select('id', { count: 'exact', head: true }).eq('trainer_id', user.id);
    if ((count || 0) > 0) redirect('/trainer-dashboard');
  }

  const initialName = String(user.user_metadata?.display_name || '');

  return (
    <main className="page-shell onboarding-shell">
      <section className="page-heading">
        <span className="eyebrow">For hundetrenere</span>
        <h1>Opprett trenerprofilen din</h1>
        <p className="muted">Tre enkle steg. Du kan endre alt senere.</p>
      </section>
      <TrainerOnboardingForm initialName={initialName} />
    </main>
  );
}
