import { downloadHeaders } from '@/lib/exports';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCourseCertificatePdf } from '@/lib/certificates/pdf';

export async function GET(request:Request,{params}:{params:Promise<{purchaseId:string}>}){
  const {purchaseId}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){const url=new URL(request.url);return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname)}`,url.origin));}

  const {data:purchase}=await supabase.from('online_course_purchases').select('*').eq('id',purchaseId).eq('customer_id',user.id).eq('status','active').eq('payment_status','captured').maybeSingle();
  if(!purchase?.course_completed_at||!purchase.certificate_id)return new NextResponse('Kursbeviset er ikke tilgjengelig',{status:404});
  const [{data:course},{data:profile}]=await Promise.all([
    supabase.from('online_courses').select('title,trainer_id,certificate_enabled,certificate_subtitle').eq('id',purchase.course_id).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle(),
  ]);
  if(!course)return new NextResponse('Kurset finnes ikke',{status:404});
  const {data:trainer}=await supabase.from('trainer_profiles').select('business_name').eq('id',course.trainer_id).maybeSingle();
  const base=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
  const bytes=await buildCourseCertificatePdf({
    certificateId:purchase.certificate_id,
    holderName:profile?.display_name||user.email||'Kunde',
    courseTitle:course.title,
    trainerName:trainer?.business_name||'Hundetrener',
    completedAt:purchase.course_completed_at,
    subtitle:course.certificate_subtitle,
    dogName:purchase.dog_name,
    verifyUrl:`${base}/certificate/${encodeURIComponent(purchase.certificate_id)}`,
  });
  const fileSlug=course.title.toLowerCase().replace(/æ/g,'ae').replace(/ø/g,'o').replace(/å/g,'a').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||'nettkurs';
  const filename=`kursbevis-${fileSlug}.pdf`;
  return new NextResponse(bytes as BodyInit,{headers:downloadHeaders('application/pdf',filename)});
}
