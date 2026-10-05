'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin, writeAudit } from '@/lib/admin/moderation';
import { activeRecipients, newsletterHtml, sendNewsletterEmail } from '@/lib/newsletter/server';

const BASE=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
function str(fd:FormData,k:string){return String(fd.get(k)||'').trim();}
export async function createPlatformCampaignAction(fd:FormData){
  const {user,admin}=await requireAdmin(); const title=str(fd,'title'),subject=str(fd,'subject'),body=str(fd,'body');
  if(!title||!subject||!body) redirect('/admin/newsletter?error=Fyll+ut+tittel,+emne+og+innhold');
  const {error}=await admin.from('newsletter_campaigns').insert({scope:'platform',created_by:user.id,title,subject,preheader:str(fd,'preheader')||null,body,cta_label:str(fd,'ctaLabel')||null,cta_url:str(fd,'ctaUrl')||null,audience:'all'}); if(error) redirect(`/admin/newsletter?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/admin/newsletter'); redirect('/admin/newsletter?message=Utkast+opprettet');
}
export async function sendPlatformCampaignAction(fd:FormData){
  const {user,admin}=await requireAdmin(); const id=str(fd,'campaignId');
  const {data:c}=await admin.from('newsletter_campaigns').select('*').eq('id',id).eq('scope','platform').maybeSingle(); if(!c) redirect('/admin/newsletter?error=Fant+ikke+nyhetsbrevet'); if(c.status==='sent') redirect('/admin/newsletter?error=Nyhetsbrevet+er+allerede+sendt');
  const recipients=(await activeRecipients({scope:'platform',audience:'all'})).slice(0,1000); await admin.from('newsletter_campaigns').update({status:'sending',recipient_count:recipients.length,last_error:null}).eq('id',id);
  let sent=0,failed=0; for(const r of recipients){
    const unsub=`${BASE}/newsletter/unsubscribe?token=${r.unsubscribe_token}`; const html=newsletterHtml({title:c.title,preheader:c.preheader,body:c.body,ctaLabel:c.cta_label,ctaUrl:c.cta_url,unsubscribeUrl:unsub});
    const {data:d}=await admin.from('newsletter_deliveries').upsert({campaign_id:id,subscription_id:r.id,email:r.email,status:'pending'},{onConflict:'campaign_id,email'}).select('id').single();
    try{const provider=await sendNewsletterEmail({to:r.email,subject:c.subject,html,unsubscribeToken:r.unsubscribe_token});sent++;if(d)await admin.from('newsletter_deliveries').update({status:'sent',provider_id:provider,sent_at:new Date().toISOString()}).eq('id',d.id);}catch(e){failed++;if(d)await admin.from('newsletter_deliveries').update({status:'failed',error_message:e instanceof Error?e.message:String(e)}).eq('id',d.id);}
  }
  await admin.from('newsletter_campaigns').update({status:failed&&sent===0?'failed':'sent',sent_count:sent,failed_count:failed,sent_at:new Date().toISOString(),last_error:failed?`${failed} sendinger feilet`:null}).eq('id',id);
  await writeAudit(admin,{adminId:user.id,actionType:'newsletter_sent',targetType:'newsletter_campaign',targetId:id,note:`${sent} sendt, ${failed} feilet`}); revalidatePath('/admin/newsletter'); redirect(`/admin/newsletter?message=${encodeURIComponent(`Nyhetsbrevet er sendt til ${sent} mottakere.`)}`);
}
