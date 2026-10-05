'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bestEffortNotification } from '@/lib/notifications/server';

export type ReportTargetType = 'trainer' | 'review' | 'message' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'misleading' | 'inappropriate' | 'safety' | 'other';

const targetTypes = new Set<ReportTargetType>(['trainer','review','message','user']);
const reasons = new Set<ReportReason>(['spam','harassment','misleading','inappropriate','safety','other']);

function cleanText(value: string | undefined | null, max: number) {
  return String(value || '').trim().slice(0, max);
}

async function validateTarget(admin: ReturnType<typeof createAdminClient>, reporterId: string, targetType: ReportTargetType, targetId: string) {
  if (targetType === 'trainer') {
    const { data } = await admin.from('trainer_profiles').select('id').eq('id', targetId).maybeSingle();
    return Boolean(data);
  }
  if (targetType === 'review') {
    const { data } = await admin.from('reviews').select('id').eq('id', targetId).maybeSingle();
    return Boolean(data);
  }
  if (targetType === 'message') {
    const { data: message } = await admin.from('booking_messages').select('id,booking_id').eq('id', targetId).maybeSingle();
    if (!message) return false;
    const { data: booking } = await admin.from('bookings').select('customer_id,trainer_id').eq('id', message.booking_id).maybeSingle();
    return Boolean(booking && [booking.customer_id, booking.trainer_id].includes(reporterId));
  }
  if (targetType === 'user') {
    const { data } = await admin.from('profiles').select('id').eq('id', targetId).maybeSingle();
    return Boolean(data && data.id !== reporterId);
  }
  return false;
}

export async function submitModerationReportAction(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}) {
  if (!targetTypes.has(input.targetType) || !reasons.has(input.reason) || !input.targetId) {
    throw new Error('Ugyldig rapport.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Du må være logget inn for å rapportere innhold.');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', user.id).maybeSingle();
  if (profile?.account_status === 'suspended') throw new Error('Kontoen er suspendert.');

  if (!(await validateTarget(admin, user.id, input.targetType, input.targetId))) {
    throw new Error('Dette innholdet kan ikke rapporteres.');
  }

  const { data: existing } = await admin
    .from('moderation_reports')
    .select('id')
    .eq('reporter_id', user.id)
    .eq('target_type', input.targetType)
    .eq('target_id', input.targetId)
    .in('status', ['open','in_review'])
    .maybeSingle();

  if (existing) return { ok: true, duplicate: true };

  const { data: report, error } = await admin.from('moderation_reports').insert({
    reporter_id: user.id,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    details: cleanText(input.details, 2000) || null,
  }).select('id').single();
  if (error) throw error;

  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin').eq('account_status', 'active');
  await Promise.all((admins || []).map((row) => bestEffortNotification({
    userId: row.id,
    type: 'system',
    title: 'Ny modereringsrapport',
    body: `En ${input.targetType === 'trainer' ? 'trenerprofil' : input.targetType === 'review' ? 'vurdering' : input.targetType === 'message' ? 'melding' : 'bruker'} er rapportert.`,
    href: `/admin/moderation?report=${report.id}`,
    eventKey: `moderation-report/${report.id}`,
    metadata: { report_id: report.id, target_type: input.targetType, target_id: input.targetId },
  })));

  return { ok: true, duplicate: false };
}
