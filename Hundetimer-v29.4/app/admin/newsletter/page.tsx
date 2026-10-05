import { AdminNav } from '@/components/admin-nav';
import { requireAdmin } from '@/lib/admin/moderation';
import { createPlatformCampaignAction, sendPlatformCampaignAction } from './actions';
function dt(v:string){return new Intl.DateTimeFormat('nb-NO',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(v));}
export default async function AdminNewsletterPage({searchParams}:{searchParams:Promise<{message?:string;error?:string}>}){
  const q=await searchParams; const {admin}=await requireAdmin();
  const [{data:campaigns},{count:subscribers}]=await Promise.all([
    admin.from('newsletter_campaigns').select('*').eq('scope','platform').order('created_at',{ascending:false}).limit(50),
    admin.from('newsletter_subscriptions').select('id',{count:'exact',head:true}).eq('scope','platform').is('unsubscribed_at',null)
  ]);
  return <main className="page-shell admin-page"><AdminNav/>
    <section className="dashboard-heading"><div><span className="eyebrow">Admin</span><h1>Nyhetsbrev</h1><p className="muted">{subscribers||0} personer har aktivt samtykke til markedsføring fra plattformen.</p></div></section>
    {q.message?<div className="notice success">{q.message}</div>:null}{q.error?<div className="notice error">{q.error}</div>:null}
    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Nytt utsend</span><h2>Lag plattformnyhetsbrev</h2></div></div>
      <form action={createPlatformCampaignAction} className="form-grid editor-form-grid"><label>Intern tittel<input name="title" required placeholder="Oktober-nyheter"/></label><label>Emnefelt<input name="subject" required placeholder="Nye kurs nær deg i oktober"/></label><label className="full">Forhåndstekst<input name="preheader" placeholder="Se nye kurs, nettkurs og arrangementer"/></label><label className="full">Innhold<textarea name="body" rows={10} required placeholder={'Hei!\n\nDenne måneden...'}/></label><label>Knappetekst<input name="ctaLabel" placeholder="Oppdag kurs"/></label><label>Knappelenke<input name="ctaUrl" placeholder="https://.../discover"/></label><div className="full"><button className="btn">Lagre som utkast</button></div></form>
    </section>
    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Historikk</span><h2>Utsendelser</h2></div></div><div className="booking-list">
      {(campaigns||[]).map(c=><article className="booking-row" key={c.id}><div><strong>{c.title}</strong><span>{c.subject} · {c.status==='draft'?'Utkast':c.status==='sent'?'Sendt':c.status}</span><span className="muted small">{c.sent_at?dt(c.sent_at):dt(c.created_at)} · {c.sent_count||0} sendt · {c.failed_count||0} feilet</span></div>{c.status==='draft'?<form action={sendPlatformCampaignAction}><input type="hidden" name="campaignId" value={c.id}/><button className="btn compact" type="submit">Send til {subscribers||0}</button></form>:null}</article>)}
      {!campaigns?.length?<p className="muted">Ingen nyhetsbrev ennå.</p>:null}
    </div></section>
  </main>;
}
