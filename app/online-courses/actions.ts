'use server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeCheckoutConfigured, siteUrl } from '@/lib/stripe/server';
import { applyPromotionToPurchase, releasePromotionForPurchase } from '@/lib/promotions/server';
import { syncOnlineCoursePaymentIntent } from '@/lib/stripe/online-course-sync';

function msg(e:unknown){return e instanceof Error?e.message:'Noe gikk galt.';}
export async function buyOnlineCourseAction(formData:FormData){
  const courseId=String(formData.get('courseId')||'');
  const slug=String(formData.get('slug')||'');
  const dogValue=String(formData.get('dogId')||'');
  const dogId=dogValue||null;
  const promoCode=String(formData.get('promoCode')||'').trim();
  const confirmationTokenId=String(formData.get('confirmationTokenId')||'');
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {ok:false,error:'Økten din har utløpt. Logg inn igjen og prøv på nytt.'};
  if(!isStripeCheckoutConfigured())return {ok:false,error:'Stripe er ikke konfigurert ennå.'};
  if(!confirmationTokenId)return {ok:false,error:'Kortopplysningene mangler. Prøv igjen.'};

  let purchaseId:string|null=null;
  try{
    const {data,error}=await supabase.rpc('create_online_course_checkout_purchase',{p_course_id:courseId,p_dog_id:dogId});
    if(error)throw error;
    purchaseId=String(data||'');
    if(!purchaseId)throw new Error('Kjøpet ble ikke opprettet.');
    if(promoCode) await applyPromotionToPurchase('online_course',purchaseId,promoCode);

    const {data:purchase,error:perr}=await supabase.from('online_course_purchases').select('id,course_id,subtotal_nok,service_fee_nok,discount_nok,promotion_code').eq('id',purchaseId).single();
    if(perr||!purchase)throw perr||new Error('Fant ikke kjøpet.');
    const {data:course,error:cerr}=await supabase.from('online_courses').select('title,trainer_id,slug').eq('id',courseId).single();
    if(cerr||!course)throw cerr||new Error('Fant ikke kurset.');
    const {data:trainer}=await supabase.from('trainer_profiles').select('business_name').eq('id',course.trainer_id).maybeSingle();
    const totalNok=purchase.subtotal_nok+purchase.service_fee_nok;
    if(totalNok<=0)throw new Error('Beløpet kan ikke betales med Stripe.');

    const returnUrl=`${siteUrl()}/learn/${purchase.id}?payment=success`;
    const intent=await getStripe().paymentIntents.create({
      amount:totalNok*100,
      currency:'nok',
      confirm:true,
      confirmation_token:confirmationTokenId,
      payment_method_types:['card'],
      receipt_email:user.email||undefined,
      return_url:returnUrl,
      description:`${course.title}${trainer?.business_name?` · ${trainer.business_name}`:''}`,
      metadata:{purchase_type:'online_course',online_course_purchase_id:purchase.id,course_id:courseId,trainer_id:course.trainer_id},
    });

    await createAdminClient().from('online_course_purchases').update({stripe_payment_intent_id:intent.id,stripe_checkout_session_id:null}).eq('id',purchase.id);
    if(intent.status==='succeeded') await syncOnlineCoursePaymentIntent(intent);

    return {ok:true,status:intent.status,clientSecret:intent.client_secret||undefined,totalNok,referenceId:purchase.id,returnUrl:`/learn/${purchase.id}?payment=success`};
  }catch(e){
    if(purchaseId){
      try{await releasePromotionForPurchase('online_course',purchaseId);}catch{}
      try{await createAdminClient().rpc('system_expire_online_course_checkout',{p_purchase_id:purchaseId});}catch{}
    }
    return {ok:false,error:msg(e)};
  }
}
