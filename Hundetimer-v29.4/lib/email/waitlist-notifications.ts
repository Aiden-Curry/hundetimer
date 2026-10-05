import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';
import { formatOsloDateTime } from '@/lib/oslo-time';
import { bestEffortNotification } from '@/lib/notifications/server';

const BRAND = process.env.EMAIL_BRAND_NAME?.trim() || 'Hundetimer';
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

function esc(value: string) { return value.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c] || c)); }
function frame(title: string, intro: string, lines: Array<[string,string]>, label: string, url: string) {
  return `<!doctype html><html lang="nb"><body style="margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:22px;padding:34px"><p style="margin:0 0 12px;color:#78826f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${esc(BRAND)}</p><h1 style="font-size:28px;margin:0 0 16px">${esc(title)}</h1><p style="font-size:16px;line-height:1.6;color:#484844">${esc(intro)}</p><table width="100%" style="margin:24px 0;background:#f7f5ef;border-radius:14px;padding:8px 18px">${lines.map(([k,v]) => `<tr><td style="padding:10px 0;color:#6b6b67">${esc(k)}</td><td style="padding:10px 0;text-align:right;font-weight:700">${esc(v)}</td></tr>`).join('')}</table><p><a href="${esc(url)}" style="display:inline-block;background:#20251f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${esc(label)}</a></p></div></div></body></html>`;
}

async function context(waitlistId: string) {
  const admin = createAdminClient();
  const { data: entry } = await admin.from('group_waitlist').select('*').eq('id', waitlistId).maybeSingle();
  if (!entry) return null;
  const { data: offering } = await admin.from('group_offerings').select('id,title,trainer_id').eq('id', entry.offering_id).maybeSingle();
  if (!offering) return null;
  const [{ data: trainer }, ownerAuth, { data: sessions }] = await Promise.all([
    admin.from('trainer_profiles').select('business_name').eq('id', offering.trainer_id).maybeSingle(),
    admin.auth.admin.getUserById(entry.customer_id),
    admin.from('group_sessions').select('starts_at').eq('offering_id', offering.id).order('starts_at').limit(1),
  ]);
  return {
    entry,
    offering,
    trainerName: trainer?.business_name || 'Hundetrener',
    ownerEmail: ownerAuth.data.user?.email || null,
    firstStart: sessions?.[0]?.starts_at || null,
  };
}

export async function notifyWaitlistJoined(waitlistId: string) {
  const ctx = await context(waitlistId); if (!ctx) return;
  const lines: Array<[string,string]> = [['Aktivitet', ctx.offering.title], ['Hund', ctx.entry.dog_name]];
  if (ctx.firstStart) lines.push(['Starter', formatOsloDateTime(ctx.firstStart)]);
  await Promise.allSettled([
    bestEffortNotification({ userId: ctx.entry.customer_id, type:'course', title:'Du står på ventelisten', body:`${ctx.entry.dog_name} står nå på ventelisten til ${ctx.offering.title}.`, href:`/activities/${ctx.offering.id}`, eventKey:`waitlist-joined/${waitlistId}` }),
    sendTransactionalEmail({ to:ctx.ownerEmail, subject:`Venteliste: ${ctx.offering.title}`, idempotencyKey:`waitlist-joined/${waitlistId}`, html:frame('Du står på ventelisten', `Vi sier fra så snart det blir din tur til å bestille en plass hos ${ctx.trainerName}.`, lines, 'Se ventelisten', `${BASE_URL}/activities/${ctx.offering.id}`) }),
  ]);
}

export async function notifyWaitlistOffer(waitlistId: string) {
  const ctx = await context(waitlistId); if (!ctx || ctx.entry.status !== 'offered') return;
  const lines: Array<[string,string]> = [['Aktivitet', ctx.offering.title], ['Hund', ctx.entry.dog_name]];
  if (ctx.entry.offer_expires_at) lines.push(['Prioritet til', formatOsloDateTime(ctx.entry.offer_expires_at)]);
  await Promise.allSettled([
    bestEffortNotification({ userId:ctx.entry.customer_id, type:'course', title:'En plass er ledig 🎉', body:`${ctx.entry.dog_name} har fått førsterett på en plass på ${ctx.offering.title}.`, href:`/activities/${ctx.offering.id}`, eventKey:`waitlist-offer/${waitlistId}/${ctx.entry.offered_at || ''}` }),
    sendTransactionalEmail({ to:ctx.ownerEmail, subject:`En plass er ledig på ${ctx.offering.title}`, idempotencyKey:`waitlist-offer/${waitlistId}/${ctx.entry.offered_at || ''}`, html:frame('En plass er ledig', `${ctx.entry.dog_name} har nå førsterett på en plass. Bestill før fristen, ellers går tilbudet videre til neste på ventelisten.`, lines, 'Bestill plassen', `${BASE_URL}/activities/${ctx.offering.id}`) }),
  ]);
}

export async function notifyWaitlistOfferExpired(waitlistId: string) {
  const ctx = await context(waitlistId); if (!ctx) return;
  await Promise.allSettled([
    bestEffortNotification({ userId:ctx.entry.customer_id, type:'course', title:'Ventelistetilbudet utløp', body:`Prioritetsperioden for ${ctx.offering.title} er utløpt.`, href:`/activities/${ctx.offering.id}`, eventKey:`waitlist-expired/${waitlistId}/${ctx.entry.offered_at || ''}` }),
    sendTransactionalEmail({ to:ctx.ownerEmail, subject:`Ventelistetilbudet til ${ctx.offering.title} utløp`, idempotencyKey:`waitlist-expired/${waitlistId}/${ctx.entry.offered_at || ''}`, html:frame('Tilbudet er utløpt', 'Prioritetsperioden er over, og plassen kan ha gått videre til neste på ventelisten.', [['Aktivitet',ctx.offering.title],['Hund',ctx.entry.dog_name]], 'Se aktiviteten', `${BASE_URL}/activities/${ctx.offering.id}`) }),
  ]);
}

export async function notifyPendingWaitlistOffers(offeringId?: string) {
  const admin = createAdminClient();
  let query = admin.from('group_waitlist').select('id').eq('status','offered').is('offer_notified_at', null).gt('offer_expires_at', new Date().toISOString()).order('offered_at').limit(100);
  if (offeringId) query = query.eq('offering_id', offeringId);
  const { data: rows } = await query;
  for (const row of rows || []) {
    await notifyWaitlistOffer(row.id);
    await admin.from('group_waitlist').update({ offer_notified_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', row.id).eq('status','offered');
  }
  return rows?.length || 0;
}
