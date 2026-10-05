import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';

const BASE_URL=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
const BRAND=process.env.EMAIL_BRAND_NAME?.trim()||'Hundetimer';
let client:Resend|null=null;
function resend(){const key=process.env.RESEND_API_KEY;if(!key)return null;if(!client)client=new Resend(key);return client;}
function esc(v:string){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]||c));}
function nl(v:string){return esc(v).replace(/\n/g,'<br/>');}

export function newsletterHtml(input:{title:string;preheader?:string|null;body:string;ctaLabel?:string|null;ctaUrl?:string|null;unsubscribeUrl:string;senderName?:string}){
  const sender=input.senderName||BRAND;
  const cta=input.ctaLabel&&input.ctaUrl?`<p style="margin:28px 0"><a href="${esc(input.ctaUrl)}" style="display:inline-block;background:#20251f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${esc(input.ctaLabel)}</a></p>`:'';
  return `<!doctype html><html lang="nb"><body style="margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b"><div style="display:none;max-height:0;overflow:hidden">${esc(input.preheader||'')}</div><div style="max-width:650px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:22px;padding:34px"><p style="margin:0 0 12px;color:#78826f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${esc(sender)}</p><h1 style="font-size:30px;line-height:1.2;margin:0 0 18px">${esc(input.title)}</h1><div style="font-size:16px;line-height:1.7;color:#42423f">${nl(input.body)}</div>${cta}<hr style="border:0;border-top:1px solid #e7e4db;margin:32px 0 18px"><p style="font-size:12px;line-height:1.6;color:#777">Du mottar denne e-posten fordi du har valgt å motta nyheter. <a href="${esc(input.unsubscribeUrl)}">Meld deg av</a>.</p></div></div></body></html>`;
}

export async function sendNewsletterEmail(input:{to:string;subject:string;html:string;unsubscribeToken:string;replyTo?:string|null}){
  const r=resend(); if(!r) throw new Error('RESEND_API_KEY mangler.');
  const testTo=process.env.EMAIL_TEST_TO?.trim(); const actualTo=testTo||input.to;
  const subject=testTo&&testTo.toLowerCase()!==input.to.toLowerCase()?`[TEST til ${input.to}] ${input.subject}`:input.subject;
  const from=process.env.NEWSLETTER_FROM?.trim()||process.env.EMAIL_FROM?.trim()||'Hundetimer <onboarding@resend.dev>';
  const oneClick=`${BASE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const {data,error}=await r.emails.send({from,to:actualTo,subject,html:input.html,replyTo:input.replyTo||process.env.EMAIL_REPLY_TO?.trim()||undefined,headers:{'List-Unsubscribe':`<${oneClick}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
  if(error)throw new Error(error.message); return data?.id||null;
}

export async function activeRecipients(campaign:{scope:'platform'|'trainer';trainer_id?:string|null;audience:string}){
  const admin=createAdminClient(); let q=admin.from('newsletter_subscriptions').select('*').eq('scope',campaign.scope).is('unsubscribed_at',null);
  if(campaign.scope==='trainer')q=q.eq('trainer_id',campaign.trainer_id!);
  if(campaign.audience==='marketplace')q=q.eq('source','marketplace'); if(campaign.audience==='external')q=q.eq('source','external');
  const {data,error}=await q.order('subscribed_at'); if(error)throw error; const seen=new Set<string>();
  return (data||[]).filter((r:any)=>{const e=String(r.email||'').toLowerCase();if(!e||seen.has(e))return false;seen.add(e);return true;});
}
