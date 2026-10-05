import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnlineCourseEditor } from '@/components/online-course-editor';

export default async function OnlineCourseEditorPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect(`/login?next=/trainer-dashboard/online-courses/${id}`);
  const {data:course}=await supabase.from('online_courses').select('*').eq('id',id).eq('trainer_id',user.id).maybeSingle(); if(!course) notFound();
  const [{data:modules},{data:lessons},{data:contents}]=await Promise.all([
    supabase.from('online_course_modules').select('*').eq('course_id',id).order('position'),
    supabase.from('online_course_lessons').select('*').eq('course_id',id).order('position'),
    supabase.from('online_course_lesson_content').select('*').eq('course_id',id),
  ]);
  return <main className="page-shell"><Link className="back-link" href="/trainer-dashboard/online-courses">← Mine nettkurs</Link><OnlineCourseEditor course={course} modules={modules||[]} lessons={lessons||[]} contents={contents||[]}/></main>;
}
