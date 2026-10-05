import { CustomerNavigation } from '@/components/customer-navigation';
import '@/components/customer-pages.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SaveButton } from '@/components/save-button';
import { formatOsloDateTime } from '@/lib/oslo-time';

function money(value:number){return new Intl.NumberFormat('nb-NO').format(value)+' kr';}

type SavedRow={id:string;item_type:'trainer'|'service'|'activity'|'online_course';item_id:string;created_at:string};

export default async function SavedPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login?next=/saved');
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(profile?.role==='admin') redirect('/admin/trainers');

  const {data:saved}=await supabase.from('saved_items').select('id,item_type,item_id,created_at').eq('owner_id',user.id).order('created_at',{ascending:false});
  const rows=(saved||[]) as SavedRow[];
  const trainerIds=rows.filter(r=>r.item_type==='trainer').map(r=>r.item_id);
  const serviceIds=rows.filter(r=>r.item_type==='service').map(r=>r.item_id);
  const activityIds=rows.filter(r=>r.item_type==='activity').map(r=>r.item_id);
  const courseIds=rows.filter(r=>r.item_type==='online_course').map(r=>r.item_id);

  const [{data:trainers},{data:services},{data:activities},{data:courses}] = await Promise.all([
    trainerIds.length?supabase.from('trainer_profiles').select('id,slug,business_name,city,bio,profile_image_url,verified,specialties').in('id',trainerIds).eq('verified',true):Promise.resolve({data:[]}),
    serviceIds.length?supabase.from('services').select('id,trainer_id,title,description,price_nok,duration_minutes,delivery_mode,active').in('id',serviceIds).eq('active',true):Promise.resolve({data:[]}),
    activityIds.length?supabase.from('group_offerings').select('id,trainer_id,title,kind,city,venue_name,is_online,price_nok,capacity,confirmed_count,active').in('id',activityIds).eq('active',true).is('completed_at',null):Promise.resolve({data:[]}),
    courseIds.length?supabase.from('online_courses').select('id,trainer_id,slug,title,summary,cover_image_url,price_nok,published').in('id',courseIds).eq('published',true):Promise.resolve({data:[]}),
  ]);

  const relatedTrainerIds=Array.from(new Set([...(services||[]).map((x:any)=>x.trainer_id),...(activities||[]).map((x:any)=>x.trainer_id),...(courses||[]).map((x:any)=>x.trainer_id)]));
  const {data:relatedTrainers}=relatedTrainerIds.length?await supabase.from('trainer_profiles').select('id,business_name,slug,verified').in('id',relatedTrainerIds):{data:[] as any[]};
  const trainerMap=new Map((relatedTrainers||[]).map((t:any)=>[t.id,t]));
  const {data:sessions}=activityIds.length?await supabase.from('group_sessions').select('offering_id,starts_at').in('offering_id',activityIds).gt('starts_at',new Date().toISOString()).order('starts_at'):{data:[] as any[]};

  const available = new Set([
    ...(trainers || []).map(t => 'trainer:' + t.id), ...(services || []).map(s => 'service:' + s.id),
    ...(activities || []).map(a => 'activity:' + a.id), ...(courses || []).map(c => 'online_course:' + c.id),
  ]);
  const unavailable = rows.filter(row => !available.has(row.item_type + ':' + row.item_id));
  return <main className="page-shell customer-page"><CustomerNavigation current="/saved" />
    <section className="page-heading"><span className="eyebrow">Lagret</span><h1>Lagret</h1><p className="muted">Lagre trenere, privattimer, kurs, arrangementer og nettkurs mens du utforsker.</p></section>

    {!rows.length?<div className="empty-state saved-empty"><div className="empty-icon">♡</div><h2>Du har ikke lagret noe ennå</h2><p className="muted">Trykk på hjertet når du finner noe interessant.</p><Link className="btn" href="/discover">Oppdag hundetrening</Link></div>:null}

    {(trainers||[]).length?<section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Hundetrenere</span><h2>Lagrede trenere</h2></div></div><div className="saved-grid">{(trainers||[]).map((t:any)=><article className="saved-card" key={t.id}><SaveButton itemType="trainer" itemId={t.id} saved canSave returnPath="/saved"/><div className="saved-card-head"><div className="avatar trainer-card-avatar">{t.profile_image_url?<img src={t.profile_image_url} alt=""/>:t.business_name.slice(0,1)}</div><div><span className="eyebrow">{t.city}</span><h3>{t.business_name} {t.verified?'✓':''}</h3></div></div><p className="muted">{t.bio||'Hundetrener med bestillbare tjenester.'}</p><div className="chips">{(t.specialties||[]).slice(0,3).map((x:string)=><span className="chip" key={x}>{x}</span>)}</div><Link className="btn secondary" href={`/trainers/${t.slug}`}>Se trener</Link></article>)}</div></section>:null}

    {(services||[]).length?<section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Privattimer</span><h2>Lagrede tjenester</h2></div></div><div className="saved-grid">{(services||[]).map((s:any)=>{const trainer=trainerMap.get(s.trainer_id) as any;return <article className="saved-card" key={s.id}><SaveButton itemType="service" itemId={s.id} saved canSave returnPath="/saved"/><span className="eyebrow">Privattime</span><h3>{s.title}</h3><p className="muted">{s.description||'Privat hundetrening.'}</p><div className="saved-meta"><span>{s.duration_minutes} min</span><span>{s.delivery_mode==='online'?'På nett':s.delivery_mode==='both'?'Fysisk + på nett':'Fysisk'}</span></div><strong className="saved-price">{money(s.price_nok)}</strong><Link className="btn secondary" href={`/book/${s.id}`}>Se ledige tider</Link>{trainer?<Link className="text-link small" href={`/trainers/${trainer.slug}`}>{trainer.business_name} →</Link>:null}</article>})}</div></section>:null}

    {(activities||[]).length?<section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Kurs og arrangementer</span><h2>Lagrede aktiviteter</h2></div></div><div className="saved-grid">{(activities||[]).map((a:any)=>{const trainer=trainerMap.get(a.trainer_id) as any;const first=(sessions||[]).find((s:any)=>s.offering_id===a.id);const remaining=Math.max(0,a.capacity-a.confirmed_count);return <article className="saved-card" key={a.id}><SaveButton itemType="activity" itemId={a.id} saved canSave returnPath="/saved"/><span className={`activity-kind ${a.kind}`}>{a.kind==='course'?'Kurs':'Arrangement'}</span><h3>{a.title}</h3>{first?<p className="muted">{formatOsloDateTime(first.starts_at)}</p>:null}<p className="muted">{a.is_online?'På nett':[a.venue_name,a.city].filter(Boolean).join(' · ')}</p><div className="saved-meta"><span>{remaining} ledige</span><strong>{money(a.price_nok)}</strong></div><Link className="btn secondary" href={`/activities/${a.id}`}>Se aktivitet</Link>{trainer?<span className="muted small">{trainer.business_name}</span>:null}</article>})}</div></section>:null}

    {(courses||[]).length?<section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Nettkurs</span><h2>Lagrede nettkurs</h2></div></div><div className="saved-grid">{(courses||[]).map((c:any)=>{const trainer=trainerMap.get(c.trainer_id) as any;return <article className="saved-card saved-course-card" key={c.id}><SaveButton itemType="online_course" itemId={c.id} saved canSave returnPath="/saved"/>{c.cover_image_url?<img src={c.cover_image_url} alt=""/>:<div className="course-cover-placeholder">▶</div>}<span className="eyebrow">Nettkurs</span><h3>{c.title}</h3><p className="muted">{c.summary||'Lær i ditt eget tempo.'}</p><div className="saved-meta"><span>{trainer?.business_name||'Hundetrener'}</span><strong>{money(c.price_nok)}</strong></div><Link className="btn secondary" href={`/online-courses/${c.slug}`}>Se nettkurs</Link></article>})}</div></section>:null}
    {unavailable.length > 0 && <section className="dashboard-section"><div className="section-title"><h2>Ikke tilgjengelig akkurat nå</h2></div><p className="muted">Disse tilbudene er ikke lenger synlige. Du kan beholde dem eller fjerne dem fra listen.</p><div className="saved-unavailable">{unavailable.map(row => <div key={row.id}><span>{row.item_type === 'trainer' ? 'Hundetrener' : row.item_type === 'service' ? 'Privattime' : row.item_type === 'activity' ? 'Kurs eller arrangement' : 'Nettkurs'}</span><SaveButton itemType={row.item_type} itemId={row.item_id} saved canSave returnPath="/saved" /></div>)}</div></section>}
  </main>;
}
