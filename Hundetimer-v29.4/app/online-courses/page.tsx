import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SaveButton } from '@/components/save-button';
function money(v:number){return new Intl.NumberFormat('nb-NO').format(v)+' kr';}
export default async function OnlineCoursesPage(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const {data:viewerProfile}=user?await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle():{data:null};
  const canSave=viewerProfile?.role==='owner'; const showSave=!user||canSave;
  const {data:savedRows}=canSave?await supabase.from('saved_items').select('item_id').eq('owner_id',user!.id).eq('item_type','online_course'):{data:[] as {item_id:string}[]};
  const savedSet=new Set((savedRows||[]).map(x=>x.item_id));
  const {data:courses}=await supabase.from('online_courses').select('id,slug,title,summary,cover_image_url,price_nok,tags,level,estimated_minutes,trainer_id').eq('published',true).order('published_at',{ascending:false});
  const trainerIds=[...new Set((courses||[]).map(c=>c.trainer_id))];
  const {data:trainers}=trainerIds.length?await supabase.from('trainer_profiles').select('id,business_name,slug,profile_image_url').in('id',trainerIds).eq('verified',true):{data:[] as {id:string;business_name:string;slug:string;profile_image_url:string|null}[]};
  const trainerMap=new Map((trainers||[]).map(t=>[t.id,t]));
  return <main className="page-shell"><section className="page-heading"><span className="eyebrow">Nettkurs</span><h1>Lær hjemme, i ditt eget tempo</h1><p className="muted">Kjøp nettkurs fra hundetrenere og gjennomfør hele kurset uten å forlate plattformen.</p></section><div className="online-course-grid">{(courses||[]).map(c=>{const t=trainerMap.get(c.trainer_id);return <div className="online-course-card-wrap" key={c.id}>{showSave?<SaveButton itemType="online_course" itemId={c.id} saved={savedSet.has(c.id)} canSave={canSave} returnPath="/online-courses"/>:null}<Link href={`/online-courses/${c.slug}`} className="online-course-card">{c.cover_image_url?<img src={c.cover_image_url} alt=""/>:<div className="course-cover-placeholder">▶</div>}<div className="online-course-card-body"><span className="eyebrow">Nettkurs</span><h2>{c.title}</h2><p className="muted">{c.summary||'Se kursinnhold og lær i ditt eget tempo.'}</p><div className="chips">{(c.tags||[]).slice(0,3).map((tag:string)=><span className="chip" key={tag}>{tag}</span>)}</div><div className="online-course-card-footer"><span>{t?.business_name||'Hundetrener'}</span><strong>{money(c.price_nok)}</strong></div></div></Link></div>})}</div>{!(courses||[]).length?<div className="empty-state"><h2>Ingen nettkurs publisert ennå</h2><p className="muted">De første kursene vil dukke opp her.</p></div>:null}</main>;
}
