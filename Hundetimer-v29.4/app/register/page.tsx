import { RegisterForm } from '@/components/register-form';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string; next?: string }> }) {
  const { role, next } = await searchParams;
  const initialRole = role === 'trainer' ? 'trainer' : 'owner';

  return (
    <main className="auth-shell">
      {!isSupabaseConfigured() ? (
        <section className="setup-card">
          <span className="eyebrow">Supabase mangler</span>
          <h1>Koble til databasen først</h1>
          <p className="muted">Du kan se resten av prototypen uten database, men registrering trenger Supabase.</p>
        </section>
      ) : <RegisterForm initialRole={initialRole} nextPath={next} />}
    </main>
  );
}
