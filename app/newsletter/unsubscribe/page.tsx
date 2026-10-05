import Link from 'next/link';
import { Check, MailX } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import '@/app/auth/auth-pages.css';

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let result: 'success' | 'invalid' | 'error' = 'invalid';
  if (token) {
    try {
      const admin = createAdminClient();
      const { data: sub, error } = await admin.from('newsletter_subscriptions').select('id,scope,user_id,trainer_client_id').eq('unsubscribe_token', token).maybeSingle();
      if (error) throw error;
      if (sub) {
        const now = new Date().toISOString();
        const subscription = await admin.from('newsletter_subscriptions').update({ unsubscribed_at: now, updated_at: now }).eq('id', sub.id);
        if (subscription.error) throw subscription.error;
        if (sub.scope === 'platform' && sub.user_id) {
          const preferences = await admin.from('privacy_preferences').update({ marketing_email: false, updated_at: now }).eq('user_id', sub.user_id);
          if (preferences.error) throw preferences.error;
        }
        if (sub.scope === 'trainer' && sub.trainer_client_id) {
          const client = await admin.from('trainer_clients').update({ newsletter_opt_in: false, updated_at: now }).eq('id', sub.trainer_client_id);
          if (client.error) throw client.error;
        }
        result = 'success';
      }
    } catch { result = 'error'; }
  }
  return <main className="account-access-page"><section className="account-status-card">
    <span className="account-status-icon">{result === 'success' ? <Check size={24} aria-hidden="true" /> : <MailX size={24} aria-hidden="true" />}</span>
    <h1>{result === 'success' ? 'Du er meldt av' : result === 'error' ? 'Vi kunne ikke fullføre avmeldingen' : 'Lenken er ikke gyldig'}</h1>
    <p role={result === 'error' ? 'alert' : undefined}>{result === 'success' ? 'Du vil ikke motta flere nyhetsbrev fra denne avsenderen. Nødvendige e-poster om bestillinger og konto påvirkes ikke.' : result === 'error' ? 'Prøv å åpne lenken fra e-posten på nytt om litt. Vi kan ikke bekrefte at alle valgene dine er oppdatert.' : 'Vi fant ikke et abonnement for denne lenken. Åpne avmeldingslenken i nyhetsbrevet du mottok.'}</p>
    <div className="account-status-help"><h2>Har du en Hundetimer-konto?</h2><p>Du kan også administrere nyhetsbrev og andre personvernvalg på kontoen din.</p></div>
    <div className="account-status-actions"><Link className="btn" href="/account/privacy">Administrer e-postvalg</Link><Link className="btn secondary" href="/">Til forsiden</Link></div>
  </section></main>;
}
