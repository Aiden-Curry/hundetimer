import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';
import { formatOsloDateTime } from '@/lib/oslo-time';
import { bestEffortNotification } from '@/lib/notifications/server';

const BRAND = process.env.EMAIL_BRAND_NAME?.trim() || 'Hundetimer';
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

function esc(value: string) { return value.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c] || c)); }
function money(value: number) { return new Intl.NumberFormat('nb-NO', { style:'currency', currency:'NOK', maximumFractionDigits:0 }).format(value); }
function frame(title: string, intro: string, lines: Array<[string,string]>, label: string, url: string) {
  return `<!doctype html><html lang="nb"><body style="margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:22px;padding:34px"><p style="margin:0 0 12px;color:#78826f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${esc(BRAND)}</p><h1 style="font-size:28px;margin:0 0 16px">${esc(title)}</h1><p style="font-size:16px;line-height:1.6;color:#484844">${esc(intro)}</p><table width="100%" style="margin:24px 0;background:#f7f5ef;border-radius:14px;padding:8px 18px">${lines.map(([k,v]) => `<tr><td style="padding:10px 0;color:#6b6b67">${esc(k)}</td><td style="padding:10px 0;text-align:right;font-weight:700">${esc(v)}</td></tr>`).join('')}</table><p><a href="${esc(url)}" style="display:inline-block;background:#20251f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${esc(label)}</a></p></div></div></body></html>`;
}

async function context(enrollmentId: string) {
  const admin = createAdminClient();
  const { data: enrollment } = await admin.from('group_enrollments').select('*').eq('id', enrollmentId).maybeSingle();
  if (!enrollment) return null;
  const { data: offering } = await admin.from('group_offerings').select('title, kind, trainer_id').eq('id', enrollment.offering_id).maybeSingle();
  if (!offering) return null;
  const [{ data: trainer }, ownerAuth, trainerAuth, { data: sessions }] = await Promise.all([
    admin.from('trainer_profiles').select('business_name').eq('id', offering.trainer_id).maybeSingle(),
    admin.auth.admin.getUserById(enrollment.customer_id),
    admin.auth.admin.getUserById(offering.trainer_id),
    admin.from('group_sessions').select('starts_at').eq('offering_id', enrollment.offering_id).order('starts_at').limit(1),
  ]);
  return {
    enrollment,
    offering,
    trainerName: trainer?.business_name || 'Hundetrener',
    ownerEmail: ownerAuth.data.user?.email || null,
    trainerEmail: trainerAuth.data.user?.email || null,
    firstStart: sessions?.[0]?.starts_at || null,
  };
}

export async function notifyGroupEnrollmentConfirmed(enrollmentId: string) {
  const ctx = await context(enrollmentId); if (!ctx) return;
  const lines: Array<[string,string]> = [['Aktivitet', ctx.offering.title], ['Hund', ctx.enrollment.dog_name], ['Betalt', money(ctx.enrollment.subtotal_nok + ctx.enrollment.service_fee_nok)]];
  if (ctx.firstStart) lines.splice(2,0,['Starter', formatOsloDateTime(ctx.firstStart)]);
  await Promise.allSettled([
    bestEffortNotification({ userId: ctx.enrollment.customer_id, type: 'course', title: 'Plassen er bekreftet', body: `${ctx.enrollment.dog_name} er påmeldt ${ctx.offering.title}.`, href: `/activity-booking/${enrollmentId}`, eventKey: `group-confirmed/owner/${enrollmentId}` }),
    bestEffortNotification({ userId: ctx.offering.trainer_id, type: 'course', title: `Ny påmelding til ${ctx.offering.title}`, body: `${ctx.enrollment.dog_name} har fått en plass.`, href: '/trainer-dashboard/groups', eventKey: `group-confirmed/trainer/${enrollmentId}` }),
    sendTransactionalEmail({ to: ctx.ownerEmail, subject: `Påmeldingen til ${ctx.offering.title} er bekreftet`, idempotencyKey:`group-confirmed/owner/${enrollmentId}`, html:frame('Plassen er bekreftet', `Du og ${ctx.enrollment.dog_name} er påmeldt hos ${ctx.trainerName}.`, lines, 'Se påmeldingen', `${BASE_URL}/activity-booking/${enrollmentId}`) }),
    sendTransactionalEmail({ to: ctx.trainerEmail, subject: `Ny påmelding til ${ctx.offering.title}`, idempotencyKey:`group-confirmed/trainer/${enrollmentId}`, html:frame('Ny påmelding', `${ctx.enrollment.dog_name} har fått en plass på ${ctx.offering.title}.`, lines, 'Administrer kurs', `${BASE_URL}/trainer-dashboard/groups`) }),
  ]);
}

export async function notifyGroupEnrollmentCancelled(enrollmentId: string) {
  const ctx = await context(enrollmentId); if (!ctx) return;
  const lines: Array<[string,string]> = [['Aktivitet', ctx.offering.title], ['Hund', ctx.enrollment.dog_name]];
  await Promise.allSettled([
    bestEffortNotification({ userId: ctx.enrollment.customer_id, type: 'course', title: 'Påmeldingen er avbestilt', body: `${ctx.enrollment.dog_name} er ikke lenger påmeldt ${ctx.offering.title}.`, href: '/account', eventKey: `group-cancelled/owner/${enrollmentId}` }),
    bestEffortNotification({ userId: ctx.offering.trainer_id, type: 'course', title: 'En deltaker har avbestilt', body: `${ctx.enrollment.dog_name} er ikke lenger påmeldt ${ctx.offering.title}.`, href: '/trainer-dashboard/groups', eventKey: `group-cancelled/trainer/${enrollmentId}` }),
    sendTransactionalEmail({ to: ctx.ownerEmail, subject: `Påmeldingen til ${ctx.offering.title} er avbestilt`, idempotencyKey:`group-cancelled/owner/${enrollmentId}`, html:frame('Påmeldingen er avbestilt', 'Vi har registrert avbestillingen. Eventuell betaling er refundert eller under behandling.', lines, 'Se Min side', `${BASE_URL}/account`) }),
    sendTransactionalEmail({ to: ctx.trainerEmail, subject: `Avbestilling fra ${ctx.enrollment.dog_name}`, idempotencyKey:`group-cancelled/trainer/${enrollmentId}`, html:frame('En deltaker har avbestilt', `${ctx.enrollment.dog_name} er ikke lenger påmeldt ${ctx.offering.title}.`, lines, 'Administrer kurs', `${BASE_URL}/trainer-dashboard/groups`) }),
  ]);
}

export async function notifyGroupCompleted(enrollmentId: string) {
  const ctx = await context(enrollmentId); if (!ctx) return;
  await Promise.allSettled([bestEffortNotification({ userId: ctx.enrollment.customer_id, type: 'course', title: 'Aktiviteten er fullført', body: `Takk for at du deltok på ${ctx.offering.title}.`, href: '/account', eventKey: `group-completed/owner/${enrollmentId}` }), sendTransactionalEmail({ to: ctx.ownerEmail, subject:`Takk for ${ctx.offering.title}`, idempotencyKey:`group-completed/owner/${enrollmentId}`, html:frame('Aktiviteten er fullført', `Takk for at du deltok med ${ctx.enrollment.dog_name}.`, [['Aktivitet',ctx.offering.title],['Arrangør',ctx.trainerName]], 'Se Min side', `${BASE_URL}/account`) })]);
}
