import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrainerProfileEditor } from '@/components/trainer-profile-editor';
import { createClient } from '@/lib/supabase/server';

export default async function TrainerProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/profile');

  const [{ data: account }, { data: trainer }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('id, slug, business_name, city, bio, specialties, languages, website_url, instagram_url, profile_image_url, cover_image_url, latitude, longitude').eq('id', user.id).maybeSingle(),
  ]);
  if (account?.role !== 'trainer' || !trainer) redirect('/trainer-onboarding');

  return (
    <main className="dashboard editor-page">
      <section className="dashboard-heading">
        <div><Link className="back-link compact-back" href="/trainer-dashboard">← Tilbake til dashbord</Link><span className="eyebrow">Trenerprofil</span><h1>Rediger offentlig profil</h1><p className="muted">Dette er informasjonen hundeeiere ser når de vurderer å bestille hos deg.</p></div>
        <Link className="btn secondary" href={`/trainers/${trainer.slug}`}>Se offentlig profil</Link>
      </section>
      <TrainerProfileEditor profile={trainer} />
    </main>
  );
}
