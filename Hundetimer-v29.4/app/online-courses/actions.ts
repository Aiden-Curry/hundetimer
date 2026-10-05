'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeConfigured, siteUrl } from '@/lib/stripe/server';
import { applyPromotionToPurchase, releasePromotionForPurchase } from '@/lib/promotions/server';

function msg(e:unknown){return e instanceof Error?e.message:'Noe gikk galt.';}
export async function buyOnlineCourseAction(formData:FormData){
  const courseId=String(formData.get('courseId')||''); const slug=String(formData.get('slug')||''); const dogValue=String(formData.get('dogId')||''); const dogId=dogValue||null; const promoCode=String(formData.get('promoCode')||'').trim();
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect(`/login?next=${encodeURIComponent(`/online-courses/${slug}`)}`);
  if(!isStripeConfigured())redirect(`/online-courses/${slug}?error=${encodeURIComponent('Stripe er ikke konfigurert ennå.')}`);
  let purchaseId:string|null=null;
  try{
    const {data,error}=await supabase.rpc('create_online_course_checkout_purchase',{p_course_id:courseId,p_dog_id:dogId}); if(error)throw error; purchaseId=String(data||''); if(!purchaseId)throw new Error('Kjøpet ble ikke opprettet.'); if(promoCode) await applyPromotionToPurchase('online_course',purchaseId,promoCode);
    const {data:purchase,error:perr}=await supabase.from('online_course_purchases').select('id,course_id,subtotal_nok,service_fee_nok,discount_nok,promotion_code').eq('id',purchaseId).single(); if(perr||!purchase)throw perr||new Error('Fant ikke kjøpet.');
    const {data:course,error:cerr}=await supabase.from('online_courses').select('title,trainer_id,slug').eq('id',courseId).single(); if(cerr||!course)throw cerr||new Error('Fant ikke kurset.');
    const {data:trainer}=await supabase.from('trainer_profiles').select('business_name').eq('id',course.trainer_id).maybeSingle();
    const session=await getStripe().checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:user.email||undefined,line_items:[...(purchase.subtotal_nok>0?[{quantity:1,price_data:{currency:'nok',unit_amount:purchase.subtotal_nok*100,product_data:{name:course.title,description:[trainer?.business_name,purchase.promotion_code?`Rabattkode ${purchase.promotion_code}`:null].filter(Boolean).join(' · ')||undefined}}}]:[]),...(purchase.service_fee_nok>0?[{quantity:1,price_data:{currency:'nok',unit_amount:purchase.service_fee_nok*100,product_data:{name:'Servicegebyr'}}}]:[])],payment_intent_data:{metadata:{purchase_type:'online_course',online_course_purchase_id:purchase.id,course_id:courseId,trainer_id:course.trainer_id}},metadata:{purchase_type:'online_course',online_course_purchase_id:purchase.id,course_id:courseId,trainer_id:course.trainer_id},success_url:`${siteUrl()}/learn/${purchase.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${siteUrl()}/api/stripe/online-course-checkout/cancel?purchase=${purchase.id}&slug=${encodeURIComponent(course.slug)}`,expires_at:Math.floor(Date.now()/1000)+30*60});
    await createAdminClient().from('online_course_purchases').update({stripe_checkout_session_id:session.id,checkout_expires_at:new Date(session.expires_at*1000).toISOString()}).eq('id',purchase.id);
    if(!session.url)throw new Error('Stripe returnerte ingen betalingsside.'); redirect(session.url);
  }catch(e){if(purchaseId){try{await releasePromotionForPurchase('online_course',purchaseId);}catch{} try{await createAdminClient().rpc('system_expire_online_course_checkout',{p_purchase_id:purchaseId});}catch{}}redirect(`/online-courses/${slug}?error=${encodeURIComponent(msg(e))}`);}
}
