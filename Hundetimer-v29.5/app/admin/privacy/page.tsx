import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/moderation';
import { approveDeletionAction, processDeletionNowAction, rejectDeletionAction } from './actions';

export default async function AdminPrivacyPage({searchParams}:{searchParams:Promise<{message?:string;error?:string}>}){
  const {admin}=await requireAdmin(); const params=await searchParams;
  const {data:requests}=await admin.from('account_deletion_requests').select('*').in('status',['requires_review','pending','rejected']).order('requested_at',{ascending:false});
  const userIds=[...new Set((requests||[]).map(r=>r.user_id))];
  const {data:profiles}=userIds.length?await admin.from('profiles').select('id,display_name,role,account_status').in('id',userIds):{data:[] as any[]};
  const map=new Map((profiles||[]).map(p=>[p.id,p]));
  return <main className="page-shell wide"><section className="page-heading"><span className="eyebrow">Admin</span><h1>Personvern og sletting</h1><p className="muted">Gjennomgå trenerforespørsler og følg planlagte kontoslettinger.</p></section>
    {params.message?<div className="notice success">{params.message}</div>:null}{params.error?<div className="notice error">{params.error}</div>:null}
    <section className="dashboard-section"><div className="section-title"><h2>Sletteforespørsler</h2><Link href="/admin/moderation">Moderering</Link></div>
      {(requests||[]).length?<div className="booking-list">{requests!.map(r=>{const p=map.get(r.user_id);return <article className="booking-card" key={r.id}><div><span className={`status ${r.status}`}>{r.status}</span><h3>{p?.display_name||'Ukjent bruker'}</h3><p className="muted">{p?.role} · forespurt {new Intl.DateTimeFormat('nb-NO',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(r.requested_at))}</p>{r.scheduled_for?<p>Planlagt: {new Intl.DateTimeFormat('nb-NO',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(r.scheduled_for))}</p>:null}{r.admin_note?<p className="muted">Notat: {r.admin_note}</p>:null}</div><div className="stack-actions">{r.status==='requires_review'?<><form action={approveDeletionAction}><input type="hidden" name="requestId" value={r.id}/><input name="note" placeholder="Internt notat (valgfritt)"/><button className="btn" type="submit">Godkjenn og planlegg</button></form><form action={rejectDeletionAction}><input type="hidden" name="requestId" value={r.id}/><input name="note" placeholder="Årsak" required/><button className="btn secondary" type="submit">Avvis</button></form></>:null}{r.status==='pending'?<form action={processDeletionNowAction}><input type="hidden" name="userId" value={r.user_id}/><button className="btn danger" type="submit">Fullfør nå</button></form>:null}</div></article>})}</div>:<div className="empty-state"><h3>Ingen åpne forespørsler</h3></div>}
    </section></main>;
}
