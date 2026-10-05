import Link from 'next/link';
import { AdminNav } from '@/components/admin-nav';
import { requireAdmin } from '@/lib/admin/moderation';
import { hideMessageAction, hideReviewAction, restoreReviewAction, suspendUserAction, updateReportAction } from './actions';

const reasonLabels: Record<string,string> = { spam:'Spam eller reklame', harassment:'Trakassering', misleading:'Villedende informasjon', inappropriate:'Upassende innhold', safety:'Sikkerhet eller dyrevelferd', other:'Annet' };
const statusLabels: Record<string,string> = { open:'Åpen', in_review:'Til vurdering', resolved:'Løst', dismissed:'Avsluttet' };
const typeLabels: Record<string,string> = { trainer:'Trenerprofil', review:'Vurdering', message:'Melding', user:'Bruker' };
function date(value:string){return new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo'}).format(new Date(value));}

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string; message?: string; error?: string }> }) {
  const query = await searchParams;
  const { admin } = await requireAdmin();
  const wantedStatus = ['open','in_review','resolved','dismissed'].includes(query.status || '') ? query.status! : 'open';
  const { data: reports } = await admin.from('moderation_reports').select('*').eq('status', wantedStatus).order('created_at',{ascending:false}).limit(100);
  const rows = reports || [];
  const reporterIds = [...new Set(rows.map(r=>r.reporter_id))];
  const trainerIds = rows.filter(r=>r.target_type==='trainer').map(r=>r.target_id);
  const reviewIds = rows.filter(r=>r.target_type==='review').map(r=>r.target_id);
  const messageIds = rows.filter(r=>r.target_type==='message').map(r=>r.target_id);
  const userIds = rows.filter(r=>r.target_type==='user').map(r=>r.target_id);
  const [{data:reporters},{data:trainers},{data:reviews},{data:messages}] = await Promise.all([
    reporterIds.length ? admin.from('profiles').select('id,display_name,role,account_status').in('id',reporterIds) : Promise.resolve({data:[]}),
    trainerIds.length ? admin.from('trainer_profiles').select('id,business_name,slug').in('id',trainerIds) : Promise.resolve({data:[]}),
    reviewIds.length ? admin.from('reviews').select('id,customer_id,trainer_id,rating,comment,moderation_status').in('id',reviewIds) : Promise.resolve({data:[]}),
    messageIds.length ? admin.from('booking_messages').select('id,booking_id,sender_id,body,moderation_status').in('id',messageIds) : Promise.resolve({data:[]}),
  ]);
  const actorIds = new Set<string>(userIds);
  for (const r of reviews || []) actorIds.add(r.customer_id);
  for (const m of messages || []) actorIds.add(m.sender_id);
  for (const t of trainers || []) actorIds.add(t.id);
  const { data: actors } = actorIds.size ? await admin.from('profiles').select('id,display_name,role,account_status,suspension_reason').in('id',[...actorIds]) : {data:[]};
  const reporterMap = new Map((reporters || []).map(p=>[p.id,p]));
  const trainerMap = new Map((trainers || []).map(t=>[t.id,t]));
  const reviewMap = new Map((reviews || []).map(r=>[r.id,r]));
  const messageMap = new Map((messages || []).map(m=>[m.id,m]));
  const actorMap = new Map((actors || []).map(a=>[a.id,a]));
  const { data: audit } = await admin.from('admin_audit_log').select('id,action_type,target_type,target_id,note,created_at,admin_id').order('created_at',{ascending:false}).limit(30);
  const adminIds=[...new Set((audit||[]).map(a=>a.admin_id))];
  const {data:adminProfiles}=adminIds.length?await admin.from('profiles').select('id,display_name').in('id',adminIds):{data:[]};
  const adminMap=new Map((adminProfiles||[]).map(a=>[a.id,a.display_name]));

  return <main className="page-shell admin-page"><AdminNav/><div className="dashboard-heading"><div><span className="eyebrow">Admin</span><h1>Moderering</h1><p className="muted">Rapporter, innholdsfjerning, suspensjoner og full handlingslogg.</p></div></div>
    {query.message?<div className="notice success">{query.message}</div>:null}{query.error?<div className="notice error">{query.error}</div>:null}
    <div className="notification-filters">{['open','in_review','resolved','dismissed'].map(s=><Link key={s} className={wantedStatus===s?'active':''} href={`/admin/moderation?status=${s}`}>{statusLabels[s]}</Link>)}</div>
    <section className="content-section"><div className="section-title"><div><span className="eyebrow">Kø</span><h2>{rows.length} rapport{rows.length===1?'':'er'}</h2></div></div>
      {rows.length?<div className="moderation-list">{rows.map(report=>{
        const reporter=reporterMap.get(report.reporter_id);
        const trainer=report.target_type==='trainer'?trainerMap.get(report.target_id):null;
        const review=report.target_type==='review'?reviewMap.get(report.target_id):null;
        const message=report.target_type==='message'?messageMap.get(report.target_id):null;
        const actorId=trainer?.id||review?.customer_id||message?.sender_id||(report.target_type==='user'?report.target_id:null);
        const actor=actorId?actorMap.get(actorId):null;
        return <article className="moderation-card" id={`report-${report.id}`} key={report.id}>
          <div className="moderation-card-head"><div><span className="status-pill">{typeLabels[report.target_type]}</span><h3>{reasonLabels[report.reason]||report.reason}</h3><p className="muted small">Rapportert av {reporter?.display_name||'Bruker'} · {date(report.created_at)}</p></div><span className={`status-pill status-${report.status}`}>{statusLabels[report.status]}</span></div>
          {report.details?<blockquote className="moderation-details">{report.details}</blockquote>:null}
          {trainer?<div className="moderation-target"><strong>{trainer.business_name}</strong><Link href={`/trainers/${trainer.slug}`}>Åpne trenerprofil ↗</Link></div>:null}
          {review?<div className="moderation-target"><strong>★ {review.rating}/5 · {review.moderation_status==='hidden'?'Skjult':'Synlig'}</strong><p>{review.comment||'Ingen skriftlig kommentar.'}</p></div>:null}
          {message?<div className="moderation-target"><strong>Melding · {message.moderation_status==='hidden'?'Skjult':'Synlig'}</strong><p>{message.body}</p><Link href={`/messages/${message.booking_id}`}>Åpne samtale ↗</Link></div>:null}
          {actor?<div className="moderation-user-row"><div><strong>{actor.display_name}</strong><span className="muted small">{actor.role} · {actor.account_status==='suspended'?'Suspendert':'Aktiv'}</span></div>{actor.account_status!=='suspended'?<form action={suspendUserAction}><input type="hidden" name="userId" value={actor.id}/><input type="hidden" name="reportId" value={report.id}/><input type="hidden" name="reason" value={`Suspendert etter rapport: ${reasonLabels[report.reason]||report.reason}`}/><button className="btn danger compact" type="submit">Suspender bruker</button></form>:<Link className="btn secondary compact" href="/admin/users">Administrer bruker</Link>}</div>:null}
          <div className="moderation-actions">
            {review?.moderation_status!=='hidden'&&review?<form action={hideReviewAction}><input type="hidden" name="reviewId" value={review.id}/><input type="hidden" name="reportId" value={report.id}/><input type="hidden" name="note" value="Skjult etter administrativ vurdering."/><button className="btn secondary compact">Skjul vurdering</button></form>:null}
            {review?.moderation_status==='hidden'?<form action={restoreReviewAction}><input type="hidden" name="reviewId" value={review.id}/><input type="hidden" name="reportId" value={report.id}/><button className="btn secondary compact">Gjenopprett vurdering</button></form>:null}
            {message?.moderation_status!=='hidden'&&message?<form action={hideMessageAction}><input type="hidden" name="messageId" value={message.id}/><input type="hidden" name="reportId" value={report.id}/><input type="hidden" name="note" value="Meldingen er fjernet etter administrativ vurdering."/><button className="btn secondary compact">Skjul melding</button></form>:null}
          </div>
          <form className="moderation-resolution-form" action={updateReportAction}><input type="hidden" name="reportId" value={report.id}/><label>Adminnotat<textarea name="note" rows={2} defaultValue={report.admin_note||''}/></label><div className="button-row"><button className="btn secondary compact" name="status" value="in_review">Ta til vurdering</button><button className="btn compact" name="status" value="resolved">Marker løst</button><button className="btn ghost compact" name="status" value="dismissed">Avslutt uten tiltak</button></div></form>
        </article>;
      })}</div>:<div className="empty-state"><h3>Ingen rapporter her</h3><p className="muted">Det er ingen saker med denne statusen akkurat nå.</p></div>}
    </section>
    <section className="content-section"><div className="section-title"><div><span className="eyebrow">Audit log</span><h2>Siste adminhandlinger</h2></div></div><div className="audit-list">{(audit||[]).map(item=><div className="audit-row" key={item.id}><div><strong>{item.action_type.replaceAll('_',' ')}</strong><span className="muted small">{item.target_type}{item.target_id?` · ${item.target_id.slice(0,8)}`:''}</span></div><div className="audit-row-right"><span>{adminMap.get(item.admin_id)||'Admin'}</span><time>{date(item.created_at)}</time></div>{item.note?<p>{item.note}</p>:null}</div>)}</div></section>
  </main>;
}
