'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { expireOverdueTrainerResponses } from '@/lib/bookings/expiry';
import { sendTransactionalEmail } from '@/lib/email/server';
import { bestEffortNotification } from '@/lib/notifications/server';
import { expireWaitlistOffersAndNotify } from '@/lib/waitlist/server';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Noe gikk galt.';
}

export async function createPayoutBatchAction(formData: FormData) {
  const payoutDate = String(formData.get('payoutDate') || '');
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/admin/payouts');
    const { error } = await supabase.rpc('create_payout_batch', { p_payout_date: payoutDate });
    if (error) throw error;
  } catch (error) {
    redirect(`/admin/payouts?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/admin/payouts');
  redirect('/admin/payouts?message=Utbetalingsbatch+opprettet');
}

export async function markPayoutBatchPaidAction(formData: FormData) {
  const batchId = String(formData.get('batchId') || '');
  const bankReference = String(formData.get('bankReference') || '');
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/admin/payouts');
    const { data: items } = await supabase.from('payout_items').select('trainer_id, amount_nok').eq('batch_id', batchId);
    const { error } = await supabase.rpc('mark_payout_batch_paid', { p_batch_id: batchId, p_bank_reference: bankReference || null });
    if (error) throw error;
    const totals = new Map<string, number>();
    for (const item of items || []) totals.set(item.trainer_id, (totals.get(item.trainer_id) || 0) + Number(item.amount_nok || 0));
    await Promise.allSettled(Array.from(totals.entries()).map(([trainerId, amount]) => bestEffortNotification({
      userId: trainerId,
      type: 'payout',
      title: 'Utbetalingen er sendt',
      body: `${new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)} er markert som utbetalt.`,
      href: '/trainer-dashboard',
      eventKey: `payout-paid/${batchId}/${trainerId}`,
      metadata: { payout_batch_id: batchId, amount_nok: amount, bank_reference: bankReference || null },
    })));
  } catch (error) {
    redirect(`/admin/payouts?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/admin/payouts');
  redirect('/admin/payouts?message=Utbetalingen+er+markert+som+betalt');
}

export async function runExpiryCheckAction() {
  let message = '';
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/admin/payouts');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') throw new Error('Kun administrator kan kjøre kontrollen.');
    const [result, waitlist] = await Promise.all([expireOverdueTrainerResponses(), expireWaitlistOffersAndNotify()]);
    message = `${result.expired} utløpte forespørsler og ${waitlist.expiredWaitlistOffers} utløpte ventelistetilbud behandlet`;
    revalidatePath('/admin/payouts');
    revalidatePath('/trainer-dashboard');
    revalidatePath('/account');
  } catch (error) {
    redirect(`/admin/payouts?error=${encodeURIComponent(messageOf(error))}`);
  }
  redirect(`/admin/payouts?message=${encodeURIComponent(message)}`);
}


export async function sendTestEmailAction() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/admin/payouts');
    const { data: profile } = await supabase.from('profiles').select('role, display_name').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') throw new Error('Kun administrator kan sende testmail.');
    if (!user.email) throw new Error('Adminbrukeren mangler e-postadresse.');
    const result = await sendTransactionalEmail({
      to: user.email,
      subject: 'Test av e-postvarsler',
      idempotencyKey: `admin-test/${user.id}/${Date.now()}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px"><h1>E-post fungerer 🎉</h1><p>Hei ${profile?.display_name || 'admin'}! Denne meldingen ble sendt fra Hundetimer via Resend.</p><p>Når du tester bookinger, vil de riktige bookingvarslene sendes automatisk.</p></div>`,
      text: 'E-post fungerer. Denne meldingen ble sendt fra Hundetimer via Resend.',
    });
    if ('skipped' in result && result.skipped) throw new Error('RESEND_API_KEY mangler.');
  } catch (error) {
    redirect(`/admin/payouts?error=${encodeURIComponent(messageOf(error))}`);
  }
  redirect('/admin/payouts?message=Testmail+sendt');
}

export async function setPayoutHoldAction(formData: FormData) {
  const trainerId = String(formData.get('trainerId') || '');
  const hold = String(formData.get('hold') || '') === 'true';
  const reason = String(formData.get('reason') || '').trim();
  const adminNote = String(formData.get('adminNote') || '').trim();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/admin/payouts');
    const { error } = await supabase.rpc('set_trainer_payout_hold', {
      p_trainer_id: trainerId,
      p_hold: hold,
      p_reason: reason || null,
      p_admin_note: adminNote || null,
    });
    if (error) throw error;
  } catch (error) {
    redirect(`/admin/payouts?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/admin/payouts');
  redirect(`/admin/payouts?message=${encodeURIComponent(hold ? 'Utbetaling satt på hold' : 'Utbetalingshold fjernet')}`);
}

export async function createTrainerAdjustmentAction(formData: FormData) {
  const trainerId = String(formData.get('trainerId') || '');
  const amount = Math.round(Number(formData.get('amountNok') || 0));
  const description = String(formData.get('description') || '').trim();
  const payoutDate = String(formData.get('payoutDate') || '').trim();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/admin/payouts');
    const { error } = await supabase.rpc('create_trainer_adjustment', {
      p_trainer_id: trainerId,
      p_amount_nok: amount,
      p_description: description,
      p_payout_date: payoutDate || null,
    });
    if (error) throw error;
  } catch (error) {
    redirect(`/admin/payouts?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/admin/payouts');
  revalidatePath('/trainer-dashboard/finance');
  redirect('/admin/payouts?message=Justering+opprettet');
}
