'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin, writeAudit } from '@/lib/admin/moderation';
import { bestEffortNotification } from '@/lib/notifications/server';

function text(value: FormDataEntryValue | null, max = 3000) { return String(value || '').trim().slice(0, max); }
function back(message: string, error = false) { redirect(`/admin/moderation?${error ? 'error' : 'message'}=${encodeURIComponent(message)}`); }

export async function updateReportAction(formData: FormData) {
  const reportId = text(formData.get('reportId'), 100);
  const status = text(formData.get('status'), 30);
  const note = text(formData.get('note'));
  if (!reportId || !['open','in_review','resolved','dismissed'].includes(status)) back('Ugyldig rapport.', true);
  try {
    const { user, admin } = await requireAdmin();
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { status, admin_note: note || null, assigned_to: status === 'in_review' ? user.id : null, updated_at: now };
    if (status === 'resolved' || status === 'dismissed') Object.assign(payload, { resolved_at: now, resolved_by: user.id });
    else Object.assign(payload, { resolved_at: null, resolved_by: null });
    const { data: report, error } = await admin.from('moderation_reports').update(payload).eq('id', reportId).select('id,target_type,target_id,reporter_id').single();
    if (error) throw error;
    await writeAudit(admin, { adminId: user.id, actionType: 'report_status_changed', targetType: report.target_type, targetId: report.target_id, reportId, note, metadata: { status } });
    await bestEffortNotification({ userId: report.reporter_id, type: 'system', title: status === 'resolved' ? 'Rapporten din er behandlet' : status === 'dismissed' ? 'Rapporten din er avsluttet' : 'Rapporten din vurderes', body: note || 'En administrator har oppdatert rapporten din.', href: '/notifications', eventKey: `report-status/${reportId}/${status}` });
  } catch (error) { back(error instanceof Error ? error.message : 'Kunne ikke oppdatere rapporten.', true); }
  revalidatePath('/admin/moderation');
  back('Rapporten er oppdatert.');
}

export async function hideReviewAction(formData: FormData) {
  const reviewId = text(formData.get('reviewId'), 100);
  const reportId = text(formData.get('reportId'), 100) || null;
  const note = text(formData.get('note')) || 'Skjult etter moderering.';
  try {
    const { user, admin } = await requireAdmin();
    const { data: review, error: readError } = await admin.from('reviews').select('id,customer_id,trainer_id,comment,moderation_status').eq('id', reviewId).single();
    if (readError) throw readError;
    const now = new Date().toISOString();
    const { error } = await admin.from('reviews').update({ moderation_status: 'hidden', moderation_note: note, moderated_at: now, moderated_by: user.id }).eq('id', reviewId);
    if (error) throw error;
    await writeAudit(admin, { adminId: user.id, actionType: 'review_hidden', targetType: 'review', targetId: reviewId, reportId, note, metadata: { previous_status: review.moderation_status, comment: review.comment } });
    await bestEffortNotification({ userId: review.customer_id, type: 'system', title: 'Vurderingen din er skjult', body: note, href: '/account', eventKey: `review-hidden/${reviewId}/${now}` });
  } catch (error) { back(error instanceof Error ? error.message : 'Kunne ikke skjule vurderingen.', true); }
  revalidatePath('/admin/moderation'); revalidatePath('/discover');
  back('Vurderingen er skjult.');
}

export async function restoreReviewAction(formData: FormData) {
  const reviewId = text(formData.get('reviewId'), 100);
  const reportId = text(formData.get('reportId'), 100) || null;
  const note = text(formData.get('note')) || 'Vurderingen er gjenopprettet.';
  try {
    const { user, admin } = await requireAdmin();
    const now = new Date().toISOString();
    const { error } = await admin.from('reviews').update({ moderation_status: 'visible', moderation_note: note, moderated_at: now, moderated_by: user.id }).eq('id', reviewId);
    if (error) throw error;
    await writeAudit(admin, { adminId: user.id, actionType: 'review_restored', targetType: 'review', targetId: reviewId, reportId, note });
  } catch (error) { back(error instanceof Error ? error.message : 'Kunne ikke gjenopprette vurderingen.', true); }
  revalidatePath('/admin/moderation'); revalidatePath('/discover');
  back('Vurderingen er gjenopprettet.');
}

export async function hideMessageAction(formData: FormData) {
  const messageId = text(formData.get('messageId'), 100);
  const reportId = text(formData.get('reportId'), 100) || null;
  const note = text(formData.get('note')) || 'Meldingen er fjernet etter moderering.';
  try {
    const { user, admin } = await requireAdmin();
    const { data: message, error: readError } = await admin.from('booking_messages').select('id,booking_id,sender_id,body,moderation_status').eq('id', messageId).single();
    if (readError) throw readError;
    if (message.moderation_status === 'hidden') throw new Error('Meldingen er allerede skjult.');
    const now = new Date().toISOString();
    const { error } = await admin.from('booking_messages').update({ body: '[Meldingen er skjult av administrator.]', moderation_status: 'hidden', moderation_note: note, moderated_at: now, moderated_by: user.id }).eq('id', messageId);
    if (error) throw error;
    await writeAudit(admin, { adminId: user.id, actionType: 'message_hidden', targetType: 'message', targetId: messageId, reportId, note, metadata: { booking_id: message.booking_id, sender_id: message.sender_id, original_body: message.body } });
    await bestEffortNotification({ userId: message.sender_id, type: 'system', title: 'En melding er skjult av moderator', body: note, href: `/messages/${message.booking_id}`, eventKey: `message-hidden/${messageId}/${now}` });
  } catch (error) { back(error instanceof Error ? error.message : 'Kunne ikke skjule meldingen.', true); }
  revalidatePath('/admin/moderation');
  back('Meldingen er skjult.');
}

export async function suspendUserAction(formData: FormData) {
  const targetUserId = text(formData.get('userId'), 100);
  const reportId = text(formData.get('reportId'), 100) || null;
  const reason = text(formData.get('reason')) || 'Kontoen er suspendert etter moderering.';
  try {
    const { user, admin } = await requireAdmin();
    if (!targetUserId || targetUserId === user.id) throw new Error('Du kan ikke suspendere din egen adminkonto.');
    const { data: target } = await admin.from('profiles').select('id,role,display_name,account_status').eq('id', targetUserId).maybeSingle();
    if (!target) throw new Error('Fant ikke brukeren.');
    if (target.role === 'admin') throw new Error('Andre administratorer kan ikke suspenderes her.');
    const now = new Date().toISOString();
    const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' });
    if (authError) throw authError;
    const { error } = await admin.from('profiles').update({ account_status: 'suspended', suspended_at: now, suspended_by: user.id, suspension_reason: reason }).eq('id', targetUserId);
    if (error) throw error;
    if (target.role === 'trainer') await admin.from('trainer_profiles').update({ verified: false, verification_status: 'suspended', verification_reviewed_at: now, verification_review_note: reason }).eq('id', targetUserId);
    await writeAudit(admin, { adminId: user.id, actionType: 'user_suspended', targetType: 'user', targetId: targetUserId, reportId, note: reason, metadata: { role: target.role, display_name: target.display_name } });
  } catch (error) { back(error instanceof Error ? error.message : 'Kunne ikke suspendere brukeren.', true); }
  revalidatePath('/admin/moderation'); revalidatePath('/admin/users'); revalidatePath('/discover');
  back('Brukeren er suspendert.');
}

export async function unsuspendUserAction(formData: FormData) {
  const targetUserId = text(formData.get('userId'), 100);
  const note = text(formData.get('note')) || 'Suspensjonen er opphevet.';
  try {
    const { user, admin } = await requireAdmin();
    const { data: target } = await admin.from('profiles').select('id,role').eq('id', targetUserId).maybeSingle();
    if (!target) throw new Error('Fant ikke brukeren.');
    const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
    if (authError) throw authError;
    const { error } = await admin.from('profiles').update({ account_status: 'active', suspended_at: null, suspended_by: null, suspension_reason: null }).eq('id', targetUserId);
    if (error) throw error;
    if (target.role === 'trainer') await admin.from('trainer_profiles').update({ verification_status: 'not_submitted', verified: false, verification_review_note: 'Suspensjonen er opphevet. Send verifisering på nytt før profilen blir offentlig.' }).eq('id', targetUserId);
    await writeAudit(admin, { adminId: user.id, actionType: 'user_unsuspended', targetType: 'user', targetId: targetUserId, note });
    await bestEffortNotification({ userId: targetUserId, type: 'system', title: 'Suspensjonen er opphevet', body: note, href: target.role === 'trainer' ? '/bli-trener#soknad' : '/account', eventKey: `user-unsuspended/${targetUserId}/${Date.now()}` });
  } catch (error) { back(error instanceof Error ? error.message : 'Kunne ikke oppheve suspensjonen.', true); }
  revalidatePath('/admin/moderation'); revalidatePath('/admin/users');
  back('Suspensjonen er opphevet.');
}
