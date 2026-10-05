'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bestEffortNotification } from '@/lib/notifications/server';
import { sendTransactionalEmail } from '@/lib/email/server';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Noe gikk galt.';
}

async function trainerContext(next: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'trainer') redirect('/account');
  return { user, admin: createAdminClient() };
}

function htmlEscape(value: string) { return value.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char] || char)); }

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) || '').trim();
  return value || null;
}

async function notifyCustomer(options: { customerId: string; bookingId: string; dogName: string; trainerName: string; updatedAt: string }) {
  await bestEffortNotification({
    userId: options.customerId,
    type: 'booking',
    title: `Oppsummering fra timen med ${options.dogName}`,
    body: `${options.trainerName} har delt notater og hjemmeoppgaver fra privattimen.`,
    href: `/booking/${options.bookingId}`,
    eventKey: `journal:${options.bookingId}:${options.updatedAt}`,
  });
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(options.customerId);
    await sendTransactionalEmail({
      to: data.user?.email,
      subject: `Oppsummering fra timen med ${options.dogName}`,
      html: `<p>Hei!</p><p>${htmlEscape(options.trainerName)} har delt en oppsummering og eventuelle hjemmeoppgaver fra privattimen med ${htmlEscape(options.dogName)}.</p><p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/booking/${options.bookingId}">Se oppsummeringen</a></p>`,
      text: `${options.trainerName} har delt en oppsummering fra timen med ${options.dogName}. Se den på ${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')}/booking/${options.bookingId}`,
      idempotencyKey: `journal-${options.bookingId}-${options.updatedAt}`.slice(0, 240),
    });
  } catch (error) {
    console.error('[journal email]', error);
  }
}

export async function saveBookingJournalAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') || '');
  const path = `/trainer-dashboard/journal/booking/${bookingId}`;
  try {
    const { user, admin } = await trainerContext(path);
    const { data: booking } = await admin.from('bookings').select('id,trainer_id,customer_id,dog_id,dog_name,service_id,requested_starts_at').eq('id', bookingId).eq('trainer_id', user.id).maybeSingle();
    if (!booking) throw new Error('Fant ikke bestillingen.');
    const [{ data: customer }, { data: service }, dogResult, { data: trainerProfile }] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', booking.customer_id).maybeSingle(),
      admin.from('services').select('title').eq('id', booking.service_id).maybeSingle(),
      booking.dog_id ? admin.from('dogs').select('name').eq('id', booking.dog_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from('trainer_profiles').select('business_name').eq('id', user.id).maybeSingle(),
    ]);
    const now = new Date().toISOString();
    const base = {
      trainer_id: user.id,
      booking_id: booking.id,
      external_appointment_id: null,
      platform_customer_id: booking.customer_id,
      platform_dog_id: booking.dog_id,
      trainer_client_id: null,
      trainer_client_dog_id: null,
      client_name_snapshot: customer?.display_name || 'Kunde',
      dog_name_snapshot: dogResult.data?.name || booking.dog_name || 'Hund',
      service_title_snapshot: service?.title || 'Privattime',
      occurred_at: booking.requested_starts_at,
      goals: text(formData, 'goals'),
      private_notes: text(formData, 'privateNotes'),
      updated_at: now,
    };
    const { data: existingJournal } = await admin.from('trainer_lesson_journals').select('id').eq('booking_id', booking.id).maybeSingle();
    const journalResult = existingJournal
      ? await admin.from('trainer_lesson_journals').update(base).eq('id', existingJournal.id).select('id').single()
      : await admin.from('trainer_lesson_journals').insert(base).select('id').single();
    const { data: journal, error: journalError } = journalResult;
    if (journalError || !journal) throw journalError || new Error('Kunne ikke lagre journalen.');

    const publish = formData.get('publishShared') === 'on';
    const { data: previous } = await admin.from('lesson_shared_notes').select('shared_summary,homework,next_steps,published_at').eq('journal_id', journal.id).maybeSingle();
    const shared = text(formData, 'sharedSummary');
    const homework = text(formData, 'homework');
    const nextSteps = text(formData, 'nextSteps');
    const changed = previous?.shared_summary !== shared || previous?.homework !== homework || previous?.next_steps !== nextSteps || Boolean(previous?.published_at) !== publish;
    const publishedAt = publish ? (previous?.published_at || now) : null;
    const { error: sharedError } = await admin.from('lesson_shared_notes').upsert({
      journal_id: journal.id,
      trainer_id: user.id,
      customer_id: booking.customer_id,
      booking_id: booking.id,
      shared_summary: shared,
      homework,
      next_steps: nextSteps,
      published_at: publishedAt,
      updated_at: now,
    }, { onConflict: 'journal_id' });
    if (sharedError) throw sharedError;

    if (publish && changed) await notifyCustomer({ customerId: booking.customer_id, bookingId: booking.id, dogName: base.dog_name_snapshot, trainerName: trainerProfile?.business_name || 'Treneren', updatedAt: now });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(path);
  revalidatePath(`/booking/${bookingId}`);
  revalidatePath('/trainer-dashboard');
  redirect(`${path}?message=${encodeURIComponent('Journalen er lagret')}`);
}

export async function saveExternalJournalAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') || '');
  const path = `/trainer-dashboard/journal/external/${appointmentId}`;
  try {
    const { user, admin } = await trainerContext(path);
    const { data: appointment } = await admin.from('external_appointments').select('*').eq('id', appointmentId).eq('trainer_id', user.id).maybeSingle();
    if (!appointment) throw new Error('Fant ikke avtalen.');
    const [clientResult, dogResult, serviceResult] = await Promise.all([
      appointment.client_id ? admin.from('trainer_clients').select('id,name,linked_profile_id').eq('id', appointment.client_id).maybeSingle() : Promise.resolve({ data: null }),
      appointment.dog_id ? admin.from('trainer_client_dogs').select('id,name').eq('id', appointment.dog_id).maybeSingle() : Promise.resolve({ data: null }),
      appointment.service_id ? admin.from('services').select('title').eq('id', appointment.service_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const now = new Date().toISOString();
    const base = {
      trainer_id: user.id,
      booking_id: null,
      external_appointment_id: appointment.id,
      platform_customer_id: null,
      platform_dog_id: null,
      trainer_client_id: appointment.client_id,
      trainer_client_dog_id: appointment.dog_id,
      client_name_snapshot: clientResult.data?.name || 'Ekstern kunde',
      dog_name_snapshot: dogResult.data?.name || 'Hund',
      service_title_snapshot: serviceResult.data?.title || appointment.title || 'Privattime',
      occurred_at: appointment.starts_at,
      goals: text(formData, 'goals'),
      private_notes: text(formData, 'privateNotes'),
      updated_at: now,
    };
    const { data: existingJournal } = await admin.from('trainer_lesson_journals').select('id').eq('external_appointment_id', appointment.id).maybeSingle();
    const journalResult = existingJournal
      ? await admin.from('trainer_lesson_journals').update(base).eq('id', existingJournal.id).select('id').single()
      : await admin.from('trainer_lesson_journals').insert(base).select('id').single();
    const { data: journal, error: journalError } = journalResult;
    if (journalError || !journal) throw journalError || new Error('Kunne ikke lagre journalen.');
    const publish = formData.get('publishShared') === 'on';
    const { error: sharedError } = await admin.from('lesson_shared_notes').upsert({
      journal_id: journal.id,
      trainer_id: user.id,
      customer_id: clientResult.data?.linked_profile_id || null,
      booking_id: null,
      shared_summary: text(formData, 'sharedSummary'),
      homework: text(formData, 'homework'),
      next_steps: text(formData, 'nextSteps'),
      published_at: publish ? now : null,
      updated_at: now,
    }, { onConflict: 'journal_id' });
    if (sharedError) throw sharedError;
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(path);
  revalidatePath('/trainer-dashboard/clients');
  redirect(`${path}?message=${encodeURIComponent('Journalen er lagret')}`);
}
