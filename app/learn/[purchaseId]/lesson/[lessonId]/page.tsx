import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setLessonCompleteAction } from '../../actions';
import { orderedCourseLessons, completedCourseLessons, hasPaidCourseAccess } from '@/lib/course-learning';
import '@/app/learn/learning.css';

export default async function LessonPage({ params, searchParams }: { params: Promise<{ purchaseId: string; lessonId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { purchaseId, lessonId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/learn/${purchaseId}/lesson/${lessonId}`)}`);
  const { data: purchase } = await supabase.from('online_course_purchases').select('*').eq('id', purchaseId).eq('customer_id', user.id).maybeSingle();
  if (!purchase || !hasPaidCourseAccess(purchase)) redirect('/account#nettkurs');
  const [{ data: course }, { data: lesson }, { data: modules }, { data: lessons }, { data: progress }] = await Promise.all([
    supabase.from('online_courses').select('*').eq('id', purchase.course_id).single(),
    supabase.from('online_course_lessons').select('*').eq('id', lessonId).eq('course_id', purchase.course_id).maybeSingle(),
    supabase.from('online_course_modules').select('*').eq('course_id', purchase.course_id).order('position'),
    supabase.from('online_course_lessons').select('*').eq('course_id', purchase.course_id).order('position'),
    supabase.from('online_course_progress').select('lesson_id,completed_at').eq('purchase_id', purchaseId),
  ]);
  if (!lesson || !course) notFound();
  const ordered = orderedCourseLessons(modules || [], lessons || []);
  const index = ordered.findIndex(item => item.id === lessonId);
  if (index < 0) notFound();
  const completed = completedCourseLessons(ordered, progress || []);
  const done = completed.has(lessonId);
  const previous = ordered[index - 1];
  const next = ordered[index + 1];
  const pct = purchase.course_completed_at ? 100 : Math.round(completed.size / ordered.length * 100);
  const admin = createAdminClient();
  const { data: content, error: contentError } = await admin.from('online_course_lesson_content').select('*').eq('lesson_id', lessonId).maybeSingle();
  let videoUrl: string | null = null, attachmentUrl: string | null = null;
  if (content?.video_path) videoUrl = (await admin.storage.from('online-course-content').createSignedUrl(content.video_path, 3600)).data?.signedUrl || null;
  if (content?.attachment_path) attachmentUrl = (await admin.storage.from('online-course-content').createSignedUrl(content.attachment_path, 3600)).data?.signedUrl || null;

  return <main className="learning-player">
    <header className="learning-player-top"><Link href={`/learn/${purchaseId}`}><ArrowLeft size={16} aria-hidden="true" />{course.title}</Link><span>Leksjon {index + 1} av {ordered.length}</span></header>
    <div className="learning-player-grid">
      <aside className="learning-sidebar"><details open><summary>Kursinnhold</summary><div className="learning-progress"><progress value={pct} max={100} aria-label="Kursprogresjon" /><strong>{pct}% fullført</strong></div><nav aria-label="Leksjoner">{(modules || []).map(module => <div className="learning-module" key={module.id}><h2>{module.title}</h2>{ordered.filter(item => item.module_id === module.id).map(item => <Link key={item.id} href={`/learn/${purchaseId}/lesson/${item.id}`} aria-current={item.id === lessonId ? 'page' : undefined}><span aria-label={completed.has(item.id) ? 'Fullført' : 'Ikke fullført'}>{completed.has(item.id) ? '✓' : '○'}</span>{item.title}</Link>)}</div>)}</nav></details></aside>
      <article className="learning-lesson">
        <header><h1>{lesson.title}</h1>{lesson.summary && <p>{lesson.summary}</p>}{lesson.duration_minutes && <span className="learning-duration">{lesson.duration_minutes} minutter</span>}</header>
        {videoUrl && <video className="course-video" aria-label={lesson.title} controls preload="metadata" src={videoUrl} />}
        {(contentError || !content || (content.video_path && !videoUrl) || (content.attachment_path && !attachmentUrl)) && <p className="learning-error" role="alert">Noe av leksjonsinnholdet kunne ikke lastes. Prøv å laste siden på nytt.</p>}
        <div className="learning-text">{(content?.body_text || '').split(/\n+/).filter(Boolean).map((paragraph: string, i: number) => <p key={i}>{paragraph}</p>)}</div>
        {attachmentUrl && <a className="btn secondary" href={attachmentUrl} target="_blank" rel="noreferrer"><Download size={16} aria-hidden="true" />Åpne {content?.attachment_name || 'vedlegg'}<span className="sr-only"> (ny fane)</span></a>}
        <section className="learning-complete"><h2>{done ? 'Leksjonen er markert som fullført' : 'Ferdig med denne leksjonen?'}</h2><p>{purchase.course_completed_at ? 'Du repeterer et fullført kurs. Kursbeviset og den registrerte fullføringen beholdes.' : 'Marker leksjonen når du er klar. Fremgangen lagres på kontoen din.'}</p>{error && <p className="learning-error" role="alert">Fremgangen kunne ikke lagres. Prøv igjen.</p>}<form action={setLessonCompleteAction}><input type="hidden" name="purchaseId" value={purchaseId} /><input type="hidden" name="lessonId" value={lessonId} /><input type="hidden" name="complete" value={done ? 'false' : 'true'} /><button className={done ? 'btn secondary' : 'btn'} type="submit">{done ? 'Marker som ikke fullført' : 'Marker leksjonen fullført'}</button></form>{purchase.course_completed_at && <Link className="learning-certificate-link" href={`/learn/${purchaseId}`}>{purchase.certificate_id ? 'Se fullføring og kursbevis' : 'Se kursfullføring'}</Link>}</section>
        <nav className="learning-lesson-nav" aria-label="Forrige og neste leksjon">{previous ? <Link href={`/learn/${purchaseId}/lesson/${previous.id}`}><span><ArrowLeft size={15} aria-hidden="true" />Forrige leksjon</span><strong>{previous.title}</strong></Link> : <Link href={`/learn/${purchaseId}`}><span><ArrowLeft size={15} aria-hidden="true" />Til kursoversikten</span></Link>}{next ? <Link href={`/learn/${purchaseId}/lesson/${next.id}`}><span>Neste leksjon<ArrowRight size={15} aria-hidden="true" /></span><strong>{next.title}</strong></Link> : <Link href={`/learn/${purchaseId}`}><span>Til kursoversikten<ArrowRight size={15} aria-hidden="true" /></span><strong>Se fremgang og fullføring</strong></Link>}</nav>
      </article>
    </div>
  </main>;
}
