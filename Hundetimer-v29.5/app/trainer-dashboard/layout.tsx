import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TrainerDashboardSidebar } from '@/components/trainer-dashboard-sidebar';

export default async function TrainerDashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard');

  const [{ data: profile }, { data: trainer }] = await Promise.all([
    supabase.from('profiles').select('role, display_name').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('business_name, slug, verification_status').eq('id', user.id).maybeSingle(),
  ]);

  if (profile?.role !== 'trainer' || !trainer || !['approved', 'suspended'].includes(trainer.verification_status || '')) redirect('/bli-trener');

  const businessName = trainer.business_name || profile.display_name || 'Trener';
  const publicHref = trainer.slug ? `/trainers/${trainer.slug}` : null;

  return (
    <div className="trainer-app-shell">
      <TrainerDashboardSidebar
        businessName={businessName}
        publicHref={publicHref}
        verificationStatus={trainer.verification_status}
      />
      <div className="trainer-app-content">{children}</div>
    </div>
  );
}
