import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasPaidCourseAccess } from '@/lib/course-learning';

// Authorize every media/range request; never give a customer a reusable Storage URL.
export async function GET(request: Request, { params }: { params: Promise<{ purchaseId: string; lessonId: string }> }) {
  const { purchaseId, lessonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data: purchase } = await supabase.from('online_course_purchases').select('course_id,status,payment_status,access_revoked_at').eq('id', purchaseId).eq('customer_id', user.id).maybeSingle();
  if (!purchase || !hasPaidCourseAccess(purchase)) return new Response(null, { status: 403 });
  const admin = createAdminClient();
  const { data: lesson } = await admin.from('online_course_lessons').select('id').eq('id', lessonId).eq('course_id', purchase.course_id).maybeSingle();
  if (!lesson) return new Response(null, { status: 404 });
  const { data: content } = await admin.from('online_course_lesson_content').select('video_path,attachment_path').eq('lesson_id', lessonId).maybeSingle();
  const kind = new URL(request.url).searchParams.get('kind');
  const path = kind === 'video' ? content?.video_path : kind === 'attachment' ? content?.attachment_path : null;
  if (!path) return new Response(null, { status: 404 });
  const { data } = await admin.storage.from('online-course-content').createSignedUrl(path, 60);
  if (!data?.signedUrl) return new Response(null, { status: 404 });
  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('range', range);
  const upstream = await fetch(data.signedUrl, { headers, cache: 'no-store' });
  const resultHeaders = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  for (const key of ['content-type','content-length','content-range','accept-ranges']) {
    const value = upstream.headers.get(key); if (value) resultHeaders.set(key, value);
  }
  if (kind === 'attachment') resultHeaders.set('Content-Disposition', 'attachment');
  return new Response(upstream.body, { status: upstream.status, headers: resultHeaders });
}
