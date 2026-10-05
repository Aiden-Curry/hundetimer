import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';
import { bestEffortNotification } from '@/lib/notifications/server';

const BRAND = process.env.EMAIL_BRAND_NAME?.trim() || 'Hundetimer';
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
function esc(v:string){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]||c));}
function money(v:number){return new Intl.NumberFormat('nb-NO',{style:'currency',currency:'NOK',maximumFractionDigits:0}).format(v);}
function frame(title:string,intro:string,lines:Array<[string,string]>,label:string,url:string){return `<!doctype html><html lang="nb"><body style="margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:22px;padding:34px"><p style="margin:0 0 12px;color:#78826f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${esc(BRAND)}</p><h1 style="font-size:28px;margin:0 0 16px">${esc(title)}</h1><p style="font-size:16px;line-height:1.6;color:#484844">${esc(intro)}</p><table width="100%" style="margin:24px 0;background:#f7f5ef;border-radius:14px;padding:8px 18px">${lines.map(([k,v])=>`<tr><td style="padding:10px 0;color:#6b6b67">${esc(k)}</td><td style="padding:10px 0;text-align:right;font-weight:700">${esc(v)}</td></tr>`).join('')}</table><p><a href="${esc(url)}" style="display:inline-block;background:#20251f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${esc(label)}</a></p></div></div></body></html>`;}

export async function notifyOnlineCoursePurchased(purchaseId:string){
  const admin=createAdminClient();
  const {data:purchase}=await admin.from('online_course_purchases').select('*').eq('id',purchaseId).maybeSingle(); if(!purchase)return;
  const {data:course}=await admin.from('online_courses').select('title,trainer_id').eq('id',purchase.course_id).maybeSingle(); if(!course)return;
  const [{data:trainer},ownerAuth,trainerAuth]=await Promise.all([
    admin.from('trainer_profiles').select('business_name').eq('id',course.trainer_id).maybeSingle(),
    admin.auth.admin.getUserById(purchase.customer_id), admin.auth.admin.getUserById(course.trainer_id),
  ]);
  const owner=ownerAuth.data.user?.email||null; const trainerEmail=trainerAuth.data.user?.email||null; const trainerName=trainer?.business_name||'Hundetrener';
  const lines:Array<[string,string]>=[['Nettkurs',course.title],['Instruktør',trainerName],['Betalt',money(purchase.subtotal_nok+purchase.service_fee_nok)]];
  await Promise.allSettled([
    bestEffortNotification({ userId: purchase.customer_id, type: 'course', title: 'Nettkurset er klart', body: `Du har nå tilgang til ${course.title}.`, href: `/learn/${purchaseId}`, eventKey: `online-course-owner/${purchaseId}` }),
    bestEffortNotification({ userId: course.trainer_id, type: 'course', title: `Nytt salg av ${course.title}`, body: 'En kunde har kjøpt nettkurset ditt.', href: '/trainer-dashboard/online-courses', eventKey: `online-course-trainer/${purchaseId}` }),
    sendTransactionalEmail({to:owner,subject:`Du har tilgang til ${course.title}`,idempotencyKey:`online-course-owner/${purchaseId}`,html:frame('Kurset er klart',`Du kan starte ${course.title} med en gang og fortsette der du slapp når du vil.`,lines,'Start kurset',`${BASE_URL}/learn/${purchaseId}`)}),
    sendTransactionalEmail({to:trainerEmail,subject:`Nytt salg av ${course.title}`,idempotencyKey:`online-course-trainer/${purchaseId}`,html:frame('Nytt nettkurssalg',`En kunde har kjøpt ${course.title}.`,lines,'Se nettkurs',`${BASE_URL}/trainer-dashboard/online-courses`)})
  ]);
}

export async function notifyOnlineCourseCompleted(purchaseId:string){
  const admin=createAdminClient();
  const {data:purchase}=await admin.from('online_course_purchases').select('id,course_id,customer_id,dog_name,course_completed_at,certificate_id').eq('id',purchaseId).maybeSingle();
  if(!purchase?.course_completed_at)return;
  const {data:course}=await admin.from('online_courses').select('title,trainer_id,certificate_enabled').eq('id',purchase.course_id).maybeSingle();
  if(!course)return;
  const [{data:trainer},ownerAuth,{data:ownerProfile}]=await Promise.all([
    admin.from('trainer_profiles').select('business_name').eq('id',course.trainer_id).maybeSingle(),
    admin.auth.admin.getUserById(purchase.customer_id),
    admin.from('profiles').select('display_name').eq('id',purchase.customer_id).maybeSingle(),
  ]);
  const owner=ownerAuth.data.user?.email||null;
  const trainerName=trainer?.business_name||'Hundetrener';
  const lines:Array<[string,string]>=[['Nettkurs',course.title],['Instruktør',trainerName],['Fullført',new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Oslo'}).format(new Date(purchase.course_completed_at))]];
  if(purchase.certificate_id)lines.push(['Kursbevis-ID',purchase.certificate_id]);
  await Promise.allSettled([
    bestEffortNotification({userId:purchase.customer_id,type:'course',title:'Nettkurset er fullført',body:purchase.certificate_id?`Gratulerer! Kursbeviset ditt for ${course.title} er klart.`:`Gratulerer! Du har fullført ${course.title}.`,href:`/learn/${purchaseId}`,eventKey:`online-course-completed-owner/${purchaseId}`}),
    bestEffortNotification({userId:course.trainer_id,type:'course',title:`${ownerProfile?.display_name||'En kunde'} fullførte ${course.title}`,body:'Kunden har fullført alle leksjonene i nettkurset.',href:'/trainer-dashboard/online-courses',eventKey:`online-course-completed-trainer/${purchaseId}`}),
    sendTransactionalEmail({to:owner,subject:`Du har fullført ${course.title}`,idempotencyKey:`online-course-completed-owner/${purchaseId}`,html:frame('Gratulerer, kurset er fullført!',purchase.certificate_id?'Kursbeviset ditt er klart til nedlasting.':'Du har fullført alle leksjonene i kurset.',lines,purchase.certificate_id?'Se kursbevis':'Se kurset',`${BASE_URL}/learn/${purchaseId}`)})
  ]);
}
