import { CustomerNavigation } from '@/components/customer-navigation';
import '@/components/customer-pages.css';
import '@/app/learn/learning.css';
import { orderedCourseLessons, completedCourseLessons, hasPaidCourseAccess } from '@/lib/course-learning';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStripeConfigured } from '@/lib/stripe/server';
import { syncOnlineCourseCheckoutSession } from '@/lib/stripe/online-course-sync';

function completedDate(value:string){
  return new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Oslo'}).format(new Date(value));
}

export default async function LearnHome({params,searchParams}:{params:Promise<{purchaseId:string}>;searchParams:Promise<{checkout?:string;session_id?:string}>}){
  const {purchaseId}=await params;
  const {checkout,session_id}=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect(`/login?next=/learn/${purchaseId}`);

  if(checkout==='success'&&session_id&&isStripeConfigured()){
    try{await syncOnlineCourseCheckoutSession(session_id);}catch{}
  }

  const {data:purchase}=await supabase.from('online_course_purchases').select('*').eq('id',purchaseId).eq('customer_id',user.id).maybeSingle();
  if (!purchase) notFound();
  if(!hasPaidCourseAccess(purchase))return <main className="page-shell narrow"><section className="setup-card"><h1>{purchase.status === 'refunded' || purchase.payment_status === 'refunded' ? 'Kurstilgangen er avsluttet' : 'Kurset er ikke tilgjengelig ennå'}</h1><p className="muted">Kurset åpnes når betalingen er bekreftet. Hvis du nettopp betalte, kan du laste siden på nytt om litt.</p><Link className="btn" href="/account">Til Min side</Link></section></main>;

  const [{data:course},{data:modules},{data:lessons},{data:progress},{data:trainer}]=await Promise.all([
    supabase.from('online_courses').select('*').eq('id',purchase.course_id).single(),
    supabase.from('online_course_modules').select('*').eq('course_id',purchase.course_id).order('position'),
    supabase.from('online_course_lessons').select('*').eq('course_id',purchase.course_id).order('position'),
    supabase.from('online_course_progress').select('lesson_id,completed_at').eq('purchase_id',purchaseId),
    supabase.from('online_courses').select('trainer_id').eq('id',purchase.course_id).single().then(async r=>r.data?supabase.from('trainer_profiles').select('business_name,slug').eq('id',r.data.trainer_id).maybeSingle():({data:null} as any)),
  ]);

  if (!course) notFound();
  const ordered = orderedCourseLessons(modules || [], lessons || []);
  const completeSet = completedCourseLessons(ordered, progress || []);
  const total=ordered.length;
  const complete=completeSet.size;
  const pct=purchase.course_completed_at?100:(total?Math.round(complete/total*100):0);
  const firstIncomplete=ordered.find(l=>!completeSet.has(l.id))||ordered[0];
  const hasCertificate=Boolean(purchase.certificate_id&&purchase.course_completed_at);

  return <main className="page-shell customer-page learning-page"><CustomerNavigation current="/account" />
    <Link className="back-link" href="/account#nettkurs">← Mine kurs</Link>
    <section className="learn-course-header">
      {course.cover_image_url?<img src={course.cover_image_url} alt=""/>:null}
      <div>
        
        <h1>{course.title}</h1>
        <p className="muted">{trainer?.business_name||'Hundetrener'}{purchase.dog_name?` · ${purchase.dog_name}`:''}</p>
        <div className="learning-progress"><progress value={pct} max={100} aria-label="Kursprogresjon" /><strong>{pct}% fullført</strong></div>
        {firstIncomplete?<Link className="btn" href={`/learn/${purchaseId}/lesson/${firstIncomplete.id}`}>{purchase.course_completed_at ? 'Repeter leksjoner' : complete ? 'Fortsett kurset' : 'Start kurset'}</Link>:null}
      </div>
    </section>

    {purchase.course_completed_at?<section className="course-completion-card">
      <div className="course-completion-icon">✓</div>
      <div>
        <span className="eyebrow">Fullført {completedDate(purchase.course_completed_at)}</span>
        <h2>Gratulerer, du har fullført kurset!</h2>
        <p className="muted">Du har fullført alle leksjonene i {course.title}.</p>
        {hasCertificate?<div className="course-certificate-actions"><a className="btn" href={`/certificates/${purchaseId}`}>Last ned kursbevis</a><Link className="btn secondary" href={`/certificate/${purchase.certificate_id}`}>Verifiser kursbevis</Link></div>:null}
        {hasCertificate?<p className="muted tiny">Kursbevis-ID: {purchase.certificate_id}</p>:null}
      </div>
    </section>:null}

    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">Kursinnhold</span><h2>{purchase.course_completed_at ? 'Kursinnhold' : `${complete} av ${total} leksjoner fullført`}</h2></div></div>
      {purchase.course_completed_at && <p className="muted small">Fullføringen og kursbeviset beholdes når du repeterer. Leksjonsmarkeringene viser hva du har krysset av nå.</p>}{!total && <p className="muted">Ingen leksjoner er tilgjengelige ennå.</p>}<div className="course-outline">{(modules||[]).map(m=><div className="course-outline-module" key={m.id}><h3>{m.title}</h3>{ordered.filter(l=>l.module_id===m.id).map((l,index)=><Link href={`/learn/${purchaseId}/lesson/${l.id}`} className={`course-outline-lesson learn-outline-lesson ${completeSet.has(l.id)?'done':''}`} key={l.id}><span>{completeSet.has(l.id)?'✓':index+1}</span><div><strong>{l.title}</strong><small>{l.duration_minutes?`${l.duration_minutes} min`:''}</small></div><span>→</span></Link>)}</div>)}</div>
    </section>
  </main>;
}
