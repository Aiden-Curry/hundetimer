import '@/app/learn/learning.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

function date(value:string){return new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Oslo'}).format(new Date(value));}

export default async function CertificateVerificationPage({params}:{params:Promise<{certificateId:string}>}){
  const {certificateId}=await params;
  const admin=createAdminClient();
  const {data:purchase}=await admin.from('online_course_purchases').select('id,course_id,customer_id,certificate_id,certificate_issued_at,course_completed_at').eq('certificate_id',certificateId).eq('status','active').eq('payment_status','captured').maybeSingle();
  if(!purchase?.certificate_id||!purchase.course_completed_at)notFound();
  const [{data:course},{data:holder}]=await Promise.all([
    admin.from('online_courses').select('title,trainer_id,certificate_enabled').eq('id',purchase.course_id).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id',purchase.customer_id).maybeSingle(),
  ]);
  if(!course)notFound();
  const {data:trainer}=await admin.from('trainer_profiles').select('business_name,slug').eq('id',course.trainer_id).maybeSingle();
  return <main className="page-shell narrow certificate-page"><section className="certificate-verify-card"><div className="certificate-check">✓</div><span className="eyebrow">Verifisert kursbevis</span><h1>Kursbeviset er gyldig</h1><p className="lead muted">Dette kursbeviset er utstedt av plattformen etter registrert fullføring av nettkurset.</p><dl className="certificate-details"><div><dt>Deltaker</dt><dd>{holder?.display_name||'Kunde'}</dd></div><div><dt>Nettkurs</dt><dd>{course.title}</dd></div><div><dt>Instruktør</dt><dd>{trainer?.business_name||'Hundetrener'}</dd></div><div><dt>Fullført</dt><dd>{date(purchase.course_completed_at)}</dd></div><div><dt>Kursbevis-ID</dt><dd>{purchase.certificate_id}</dd></div></dl>{trainer?.slug?<Link className="btn secondary" href={`/trainers/${trainer.slug}`}>Se trenerprofil</Link>:<Link className="btn secondary" href="/online-courses">Se nettkurs</Link>}</section></main>;
}
