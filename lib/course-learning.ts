type Module = { id: string; position: number };
type Lesson = { id: string; module_id: string; position: number };

export function orderedCourseLessons<T extends Lesson>(modules: Module[], lessons: T[]): T[] {
  return [...modules].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).flatMap(module => lessons.filter(lesson => lesson.module_id === module.id).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)));
}

export function completedCourseLessons(lessons: { id: string }[], progress: { lesson_id: string; completed_at: string | null }[]) {
  const available = new Set(lessons.map(lesson => lesson.id));
  return new Set(progress.filter(item => item.completed_at && available.has(item.lesson_id)).map(item => item.lesson_id));
}

export function hasPaidCourseAccess(purchase: { status: string; payment_status: string } | null) {
  return purchase?.status === 'active' && purchase.payment_status === 'captured';
}
