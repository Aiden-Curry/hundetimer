import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export default function LoginPage() {
  return (
    <main className="auth-shell">
      {!isSupabaseConfigured() ? (
        <section className="setup-card">
          <span className="eyebrow">Supabase mangler</span>
          <h1>Koble til databasen først</h1>
          <p className="muted">Kopier <code>.env.example</code> til <code>.env.local</code> og legg inn prosjekt-URL og publishable key fra Supabase.</p>
        </section>
      ) : (
        <Suspense fallback={<div className="auth-card">Laster…</div>}><LoginForm /></Suspense>
      )}
    </main>
  );
}
