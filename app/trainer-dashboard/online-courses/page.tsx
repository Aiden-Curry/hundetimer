import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createOnlineCourseAction } from './actions';

function money(v:number){return new Intl.NumberFormat('nb-NO').format(v)+' kr';}

export default async function OnlineCoursesAdminPage({ searchParams }: { searchParams: Promise<{error?:string}> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if(!user) redirect('/login?next=/trainer-dashboard/online-courses');
  const { data:trainer } = await supabase.from('trainer_profiles').select('id').eq('id',user.id).maybeSingle();
  if(!trainer) redirect('/trainer-onboarding');
  const { data:courses } = await supabase.from('online_courses').select('id,title,slug,summary,price_nok,published,cover_image_url,updated_at').eq('trainer_id',user.id).order('updated_at',{ascending:false});
  const ids=(courses||[]).map(c=>c.id);
  const { data:purchases }=ids.length?await supabase.from('online_course_purchases').select('course_id,status,course_completed_at').in('course_id',ids).eq('status','active').eq('payment_status','captured'):{data:[] as {course_id:string;status:string;course_completed_at:string|null}[]};
  const countMap=new Map<string,number>(); const completedMap=new Map<string,number>(); (purchases||[]).forEach(p=>{countMap.set(p.course_id,(countMap.get(p.course_id)||0)+1);if(p.course_completed_at)completedMap.set(p.course_id,(completedMap.get(p.course_id)||0)+1);});
  return <main className="page-shell narrow">
    <Link className="back-link" href="/trainer-dashboard">← Til treneroversikten</Link>
    <section className="page-heading"><span className="eyebrow">Nettkurs</span><h1>Nettkurs</h1><p className="muted">Administrer kursene dine, oppdater innhold og følg med på betalte kjøp.</p></section>
    {error?<p className="form-error form-error-block">{error}</p>:null}
    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Nytt kurs</span><h2>Start med en tittel</h2></div></div><form action={createOnlineCourseAction} className="inline-create-course"><input aria-label="Kursets tittel" name="title" required placeholder="For eksempel: Gå pent i bånd"/><button className="btn" type="submit">Opprett kurs</button></form></section>
    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Mine nettkurs</span><h2>{courses?.length||0} kurs</h2></div><Link className="btn secondary compact" href="/online-courses">Se markedsplassen</Link></div>
      {(courses||[]).length?<div className="online-course-admin-grid">{courses!.map(course=><Link key={course.id} href={`/trainer-dashboard/online-courses/${course.id}`} className="online-course-admin-card">{course.cover_image_url?<img src={course.cover_image_url} alt=""/>:<div className="course-cover-placeholder">▶</div>}<div><span className={`status ${course.published?'confirmed':'pending'}`}>{course.published?'Publisert':'Utkast'}</span><h3>{course.title}</h3><p className="muted small">{money(course.price_nok)} · {countMap.get(course.id)||0} kjøp · {completedMap.get(course.id)||0} fullført</p></div></Link>)}</div>:<div className="empty-state"><h3>Ingen nettkurs ennå</h3><p className="muted">Opprett det første kurset ditt over.</p></div>}
    </section>
  </main>;
}
