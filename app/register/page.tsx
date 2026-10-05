import '@/app/auth/auth-pages.css';
import { RegisterForm } from '@/components/register-form';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return (
    <main className="account-access-page">
      {!isSupabaseConfigured() ? (
        <section className="setup-card">
          <span className="eyebrow">Supabase mangler</span>
          <h1>Koble til databasen først</h1>
          <p className="muted">Du kan se resten av prototypen uten database, men registrering trenger Supabase.</p>
        </section>
      ) : <RegisterForm nextPath={next} />}
    </main>
  );
}
