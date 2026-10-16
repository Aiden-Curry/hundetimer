import { createClient } from '@/lib/supabase/server';
import { completedCourseLessons, orderedCourseLessons } from '@/lib/course-learning';
import { CoursePurchaserControls } from '@/components/course-purchaser-controls';

type CourseModule = { id: string; title: string; position: number };
type Lesson = { id: string; title: string; module_id: string; position: number };

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

export async function TrainerCourseStudents({ course, modules, lessons }: {
  course: { id: string; title: string };
  modules: CourseModule[];
  lessons: Lesson[];
}) {
  const supabase = await createClient();
  const { data: purchases, error } = await supabase.from('online_course_purchases')
    .select('id,customer_id,dog_name,purchased_at,status,payment_status,course_completed_at,access_revoked_at,access_revoked_reason,refunded_at')
    .eq('course_id', course.id).in('status', ['active','refunded']).in('payment_status', ['captured','refunded'])
    .order('purchased_at', { ascending: false });
  if (error) return <section className="editor-card"><h2>Deltakere</h2><p role="alert">Kunne ikke hente deltakere. Prøv igjen senere.</p></section>;
  if (!purchases?.length) return <section className="editor-card"><h2>Deltakere</h2><p className="muted">Ingen har kjøpt dette kurset ennå.</p></section>;

  const [{ data: names, error: nameError }, { data: progress, error: progressError }] = await Promise.all([
    supabase.rpc('trainer_online_course_customer_names', { p_course_id: course.id }),
    supabase.from('online_course_progress').select('purchase_id,lesson_id,completed_at').in('purchase_id', purchases.map(p => p.id)),
  ]);
  if (nameError || progressError) return <section className="editor-card"><h2>Deltakere</h2><p role="alert">Kunne ikke hente fremdrift. Prøv igjen senere.</p></section>;
  const customerNames = new Map<string, string>((names || []).map((p: { customer_id: string; display_name: string }) => [p.customer_id, p.display_name]));
  const ordered = orderedCourseLessons(modules, lessons);
  const availableIds = new Set(ordered.map(l => l.id));
  return <section className="editor-card course-students" aria-labelledby="course-students-title">
    <span className="eyebrow">Kunder</span><h2 id="course-students-title">Deltakere ({purchases.filter(p => p.status === 'active' && p.payment_status === 'captured' && !p.access_revoked_at).length} aktive)</h2>
    <p className="muted">Se fremdrift og fullførte leksjoner. Deltakeren oppdaterer selv fremdriften sin.</p>
    {purchases.map(purchase => {
      const entries = (progress || []).filter(p => p.purchase_id === purchase.id && availableIds.has(p.lesson_id));
      const completed = completedCourseLessons(ordered, entries);
      const percentage = ordered.length ? Math.round(completed.size / ordered.length * 100) : 0;
      const status = purchase.course_completed_at ? 'Fullført' : completed.size ? 'Påbegynt' : 'Ikke startet';
      const lastActivity = entries.filter(p => p.completed_at).map(p => p.completed_at as string).sort().at(-1);
      const name = customerNames.get(purchase.customer_id) || 'Kunde';
      const refunded = purchase.status === 'refunded' || purchase.payment_status === 'refunded';
      return <details key={purchase.id} className="course-student">
        <summary><strong>{name}</strong>{purchase.dog_name ? <span>Hund: {purchase.dog_name}</span> : null}<span>{completed.size} av {ordered.length} leksjoner · {percentage}% · {status} · {refunded ? 'Refundert' : purchase.access_revoked_at ? 'Tilgang fjernet' : 'Aktiv tilgang'}</span></summary>
        <progress value={percentage} max={100} aria-label={`Fremdrift for ${name}`} />
        <p className="muted small">Kjøpt: {purchase.purchased_at ? dateTime(purchase.purchased_at) : 'Ikke oppgitt'} · Betaling: {refunded ? 'Refundert' : 'Betalt'}</p>
        {refunded && purchase.refunded_at ? <p>Refundert: {dateTime(purchase.refunded_at)}</p> : null}
        {purchase.access_revoked_at ? <p>Tilgang fjernet: {dateTime(purchase.access_revoked_at)}{purchase.access_revoked_reason ? ` · Grunn: ${purchase.access_revoked_reason}` : ''}</p> : null}
        {purchase.course_completed_at ? <p>Fullført: {dateTime(purchase.course_completed_at)}</p> : null}
        <p className="muted small">Sist aktivitet: {lastActivity ? dateTime(lastActivity) : 'Ikke startet'}</p>
        <div className="course-student-details"><h3>{course.title}</h3><p>{name}{purchase.dog_name ? ` · ${purchase.dog_name}` : ''} · Fremdrift: {percentage}%</p>
          {[...modules].sort((a, b) => a.position - b.position).map(module => <section key={module.id}>
            <h4>{module.title}</h4><ul>{ordered.filter(l => l.module_id === module.id).map(lesson => {
              const entry = entries.find(p => p.lesson_id === lesson.id && p.completed_at);
              return <li key={lesson.id}><strong>{lesson.title}</strong> — {entry ? `Fullført ${dateTime(entry.completed_at)}` : 'Ikke fullført'}</li>;
            })}</ul>
          </section>)}
          <CoursePurchaserControls purchaseId={purchase.id} revoked={Boolean(purchase.access_revoked_at)} refunded={refunded} />
        </div>
      </details>;
    })}
  </section>;
}
