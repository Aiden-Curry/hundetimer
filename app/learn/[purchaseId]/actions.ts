'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notifyOnlineCourseCompleted } from '@/lib/email/online-course-notifications';

export async function setLessonCompleteAction(formData:FormData){
  const purchaseId=String(formData.get('purchaseId')||'');
  const lessonId=String(formData.get('lessonId')||'');
  const complete=String(formData.get('complete')||'true')==='true';
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('set_online_course_lesson_complete_v2',{p_purchase_id:purchaseId,p_lesson_id:lessonId,p_complete:complete});
  if(error)redirect(`/learn/${encodeURIComponent(purchaseId)}/lesson/${encodeURIComponent(lessonId)}?error=progress`);
  const result=(data||{}) as {newly_completed?:boolean};
  if(result.newly_completed){
    await notifyOnlineCourseCompleted(purchaseId).catch(()=>{});
  }
  revalidatePath(`/learn/${purchaseId}`);
  revalidatePath(`/learn/${purchaseId}/lesson/${lessonId}`);
  revalidatePath('/account');
}
