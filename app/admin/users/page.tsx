import Link from 'next/link';
import { AdminNav } from '@/components/admin-nav';
import { requireAdmin } from '@/lib/admin/moderation';
import { suspendUserAction, unsuspendUserAction } from '../moderation/actions';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; message?: string; error?: string }> }) {
  const query=await searchParams; const {admin}=await requireAdmin(); const q=(query.q||'').trim(); const status=query.status==='suspended'?'suspended':query.status==='active'?'active':'';
  let builder=admin.from('profiles').select('id,display_name,role,account_status,suspended_at,suspension_reason,created_at').order('created_at',{ascending:false}).limit(150);
  if(q) builder=builder.ilike('display_name',`%${q}%`); if(status) builder=builder.eq('account_status',status);
  const {data:profiles}=await builder;
  return <main className="page-shell admin-page"><AdminNav/><div className="dashboard-heading"><div><span className="eyebrow">Admin</span><h1>Brukere</h1><p className="muted">Finn kontoer, se status og håndter suspensjoner.</p></div></div>
    {query.message?<div className="notice success">{query.message}</div>:null}{query.error?<div className="notice error">{query.error}</div>:null}
    <form className="admin-user-search"><label>Søk navn<input name="q" defaultValue={q}/></label><label>Status<select name="status" defaultValue={status}><option value="">Alle</option><option value="active">Aktiv</option><option value="suspended">Suspendert</option></select></label><button className="btn secondary" type="submit">Søk</button></form>
    <div className="admin-user-list">{(profiles||[]).map(profile=><article className="admin-user-card" key={profile.id}><div><span className="eyebrow">{profile.role}</span><h3>{profile.display_name}</h3><p className="muted small">{profile.id}</p>{profile.suspension_reason?<p className="moderation-warning">{profile.suspension_reason}</p>:null}</div><div className="admin-user-actions"><span className={`status-pill ${profile.account_status==='suspended'?'status-dismissed':'status-resolved'}`}>{profile.account_status==='suspended'?'Suspendert':'Aktiv'}</span>{profile.role!=='admin'&&(profile.account_status==='suspended'?<form action={unsuspendUserAction}><input type="hidden" name="userId" value={profile.id}/><button className="btn secondary compact">Opphev suspensjon</button></form>:<form action={suspendUserAction}><input type="hidden" name="userId" value={profile.id}/><label className="sr-only">Begrunnelse<input name="reason" defaultValue="Suspendert av administrator."/></label><button className="btn danger compact">Suspender</button></form>)}</div></article>)}</div>
    {!profiles?.length?<div className="empty-state"><h3>Ingen brukere funnet</h3><Link href="/admin/users">Nullstill søket</Link></div>:null}
  </main>;
}
