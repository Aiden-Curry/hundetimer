import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
export default async function UnsubscribePage({searchParams}:{searchParams:Promise<{token?:string}>}){
 const {token}=await searchParams; let ok=false;
 if(token){const admin=createAdminClient();const {data:sub}=await admin.from('newsletter_subscriptions').select('id,scope,user_id,trainer_client_id').eq('unsubscribe_token',token).maybeSingle();if(sub){const now=new Date().toISOString();await admin.from('newsletter_subscriptions').update({unsubscribed_at:now,updated_at:now}).eq('id',sub.id);if(sub.scope==='platform'&&sub.user_id)await admin.from('privacy_preferences').update({marketing_email:false,updated_at:now}).eq('user_id',sub.user_id);if(sub.scope==='trainer'&&sub.trainer_client_id)await admin.from('trainer_clients').update({newsletter_opt_in:false,updated_at:now}).eq('id',sub.trainer_client_id);ok=true;}}
 return <main className="page-shell"><section className="empty-state"><span className="eyebrow">Nyhetsbrev</span><h1>{ok?'Du er meldt av':'Lenken er ikke gyldig'}</h1><p className="muted">{ok?'Du vil ikke motta flere nyhetsbrev fra denne avsenderen. Nødvendige e-poster om bestillinger og konto påvirkes ikke.':'Vi fant ikke et aktivt abonnement for denne lenken.'}</p><Link className="btn" href="/">Til forsiden</Link></section></main>;
}
