import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createPromotionAction, togglePromotionAction } from './actions';

function money(v: number) { return new Intl.NumberFormat('nb-NO').format(v) + ' kr'; }
function dt(v?: string | null) { return v ? new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo'}).format(new Date(v)) : null; }
const scopeText: Record<string,string> = { all:'Alt du selger', private:'Privattimer', group:'Kurs og arrangementer', online_course:'Nettkurs' };

export default async function PromotionsPage({searchParams}:{searchParams:Promise<{message?:string;error?:string}>}) {
  const {message,error}=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login?next=/trainer-dashboard/promotions');
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(profile?.role!=='trainer') redirect('/');
  const [{data:promotions},{data:services},{data:groups},{data:courses}] = await Promise.all([
    supabase.from('promotions').select('*').eq('trainer_id',user.id).order('created_at',{ascending:false}),
    supabase.from('services').select('id,title,price_nok').eq('trainer_id',user.id).eq('active',true).order('title'),
    supabase.from('group_offerings').select('id,title,price_nok').eq('trainer_id',user.id).eq('active',true).order('title'),
    supabase.from('online_courses').select('id,title,price_nok').eq('trainer_id',user.id).order('title'),
  ]);
  const ids=(promotions||[]).map(p=>p.id);
  const {data:redemptions}=ids.length?await supabase.from('promotion_redemptions').select('promotion_id,status,discount_nok').in('promotion_id',ids):{data:[] as any[]};
  const stats=new Map<string,{reserved:number;redeemed:number;discount:number}>();
  for(const r of redemptions||[]){const s=stats.get(r.promotion_id)||{reserved:0,redeemed:0,discount:0};if(r.status==='reserved')s.reserved++;if(r.status==='redeemed'){s.redeemed++;s.discount+=r.discount_nok;}stats.set(r.promotion_id,s);}
  const productName=new Map<string,string>();
  (services||[]).forEach(x=>productName.set(x.id,x.title));(groups||[]).forEach(x=>productName.set(x.id,x.title));(courses||[]).forEach(x=>productName.set(x.id,x.title));
  return <main className="page-shell narrow">
    <Link className="back-link" href="/trainer-dashboard">← Til treneroversikten</Link>
    <section className="page-heading"><span className="eyebrow">Rabatter og kampanjer</span><h1>Rabattkoder</h1><p className="muted">Gi kunder prosent- eller kronebeløp i rabatt på privattimer, kurs, arrangementer eller nettkurs. Rabatten trekkes fra trenerprisen, mens servicegebyret på 29 kr beholdes.</p></section>
    {message?<p className="form-success form-error-block">{message}</p>:null}{error?<p className="form-error form-error-block">{error}</p>:null}
    <details className="workspace-disclosure" open={!promotions?.length || Boolean(error)}><summary>+ Opprett rabattkode</summary><section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Ny kampanje</span><h2>Opprett rabattkode</h2></div></div>
      <form action={createPromotionAction} className="form-grid editor-form-grid">
        <label>Internt navn<input name="name" required placeholder="For eksempel: Høstkampanje"/></label>
        <label>Rabattkode<input name="code" required minLength={3} maxLength={32} placeholder="HOST20" style={{textTransform:'uppercase'}}/></label>
        <label>Rabatttype<select name="discountType" defaultValue="percent"><option value="percent">Prosent</option><option value="fixed">Fast beløp i kr</option></select></label>
        <label>Rabattverdi<input name="discountValue" type="number" min="1" required defaultValue="10"/></label>
        <label>Gjelder<select name="appliesTo" defaultValue="all"><option value="all">Alt jeg selger</option><option value="private">Privattimer</option><option value="group">Kurs og arrangementer</option><option value="online_course">Nettkurs</option></select></label>
        <label>Spesifikt produkt, valgfritt<select name="target" defaultValue=""><option value="">Alle innen valgt kategori</option><optgroup label="Privattimer">{(services||[]).map(x=><option key={x.id} value={`private:${x.id}`}>{x.title} · {money(x.price_nok)}</option>)}</optgroup><optgroup label="Kurs og arrangementer">{(groups||[]).map(x=><option key={x.id} value={`group:${x.id}`}>{x.title} · {money(x.price_nok)}</option>)}</optgroup><optgroup label="Nettkurs">{(courses||[]).map(x=><option key={x.id} value={`online:${x.id}`}>{x.title} · {money(x.price_nok)}</option>)}</optgroup></select></label>
        <label>Minimumskjøp<input name="minimumSubtotal" type="number" min="0" defaultValue="0"/> <small>0 = ingen grense</small></label>
        <label>Maks antall bruk<input name="maxRedemptions" type="number" min="1" placeholder="Ubegrenset"/></label>
        <label>Maks bruk per kunde<input name="perCustomer" type="number" min="1" defaultValue="1"/></label>
        <label>Starter, valgfritt<input name="startsAt" type="datetime-local"/></label>
        <label>Utløper, valgfritt<input name="endsAt" type="datetime-local"/></label>
        <div className="full"><button className="btn" type="submit">Opprett rabattkode</button></div>
      </form>
    </section></details>
    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Dine kampanjer</span><h2>{promotions?.length||0} rabattkoder</h2></div></div>
      {(promotions||[]).length?<div className="promotion-grid">{promotions!.map(p=>{const s=stats.get(p.id)||{reserved:0,redeemed:0,discount:0};const label = !p.active ? 'Pauset' : p.ends_at && new Date(p.ends_at) <= new Date() ? 'Utløpt' : p.starts_at && new Date(p.starts_at) > new Date() ? 'Planlagt' : p.max_redemptions && s.redeemed + s.reserved >= p.max_redemptions ? 'Fullt brukt' : 'Aktiv';return <article className={`promotion-card ${p.active?'':'inactive'}`} key={p.id}><div className="promotion-head"><div><span className={`status ${p.active?'confirmed':'expired'}`}>{label}</span><h3>{p.name}</h3><code>{p.code}</code></div><strong>{p.discount_type==='percent'?`${p.discount_value}%`:`${money(p.discount_value)}`}</strong></div><p className="muted">{scopeText[p.applies_to]||p.applies_to}{p.target_id?` · ${productName.get(p.target_id)||'Spesifikt produkt'}`:''}</p><div className="promotion-meta"><span>{s.redeemed} brukt</span>{s.reserved?<span>{s.reserved} i betaling</span>:null}<span>{money(s.discount)} gitt i rabatt</span>{p.max_redemptions?<span>Maks {p.max_redemptions}</span>:<span>Ubegrenset</span>}</div>{p.starts_at||p.ends_at?<p className="muted small">{p.starts_at?`Fra ${dt(p.starts_at)}`:'Aktiv nå'}{p.ends_at?` · til ${dt(p.ends_at)}`:''}</p>:null}<form action={togglePromotionAction}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="active" value={String(!p.active)}/><button className="btn secondary compact" type="submit">{p.active?'Pause kode':'Aktiver kode'}</button></form></article>})}</div>:<div className="empty-state"><h3>Ingen rabattkoder ennå</h3><p className="muted">Opprett den første kampanjen over.</p></div>}
    </section>
  </main>;
}
