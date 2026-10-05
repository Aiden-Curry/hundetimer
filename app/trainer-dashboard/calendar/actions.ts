'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { osloLocalInputToIso } from '@/lib/oslo-time';
import {
  deleteExternalAppointmentCalendarEvent,
  disconnectCalendar,
  syncExternalAppointmentToCalendar,
  syncFutureConfirmedBookings,
  syncFutureExternalAppointments,
  syncTrainerBusyTime,
} from '@/lib/calendar/server';

async function trainer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/calendar');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'trainer') redirect('/account');
  return { supabase, user };
}

function msg(error: unknown) { return error instanceof Error ? error.message : 'Noe gikk galt.'; }

async function regenerateAllServices(supabase: Awaited<ReturnType<typeof createClient>>, trainerId: string) {
  const { data: services } = await supabase.from('services').select('id').eq('trainer_id', trainerId).eq('active', true);
  for (const service of services || []) await supabase.rpc('regenerate_service_slots', { p_service_id: service.id, p_days: 60 });
}

export async function syncCalendarAction() {
  let success = '';
  try {
    const { supabase, user } = await trainer();
    const result = await syncTrainerBusyTime(user.id, 60);
    await regenerateAllServices(supabase, user.id);
    const bookings = await syncFutureConfirmedBookings(user.id);
    const external = await syncFutureExternalAppointments(user.id);
    success = `Synkronisert ${result.blocks} opptatte perioder, ${bookings} markedsplassbestillinger og ${external} eksterne avtaler`;
  } catch (error) {
    redirect(`/trainer-dashboard/calendar?error=${encodeURIComponent(msg(error))}`);
  }
  revalidatePath('/trainer-dashboard');
  revalidatePath('/trainer-dashboard/calendar');
  redirect(`/trainer-dashboard/calendar?message=${encodeURIComponent(success)}`);
}

export async function disconnectCalendarAction() {
  try {
    const { supabase, user } = await trainer();
    await disconnectCalendar(user.id);
    await regenerateAllServices(supabase, user.id);
  } catch (error) {
    redirect(`/trainer-dashboard/calendar?error=${encodeURIComponent(msg(error))}`);
  }
  revalidatePath('/trainer-dashboard/calendar');
  redirect('/trainer-dashboard/calendar?message=Kalenderen+er+koblet+fra');
}

export async function saveCalendarSettingsAction(formData: FormData) {
  try {
    const { user } = await trainer();
    await createAdminClient().from('calendar_connections').update({
      sync_busy: formData.get('syncBusy') === 'on',
      sync_bookings: formData.get('syncBookings') === 'on',
      updated_at: new Date().toISOString(),
    }).eq('trainer_id', user.id);
  } catch (error) {
    redirect(`/trainer-dashboard/calendar?error=${encodeURIComponent(msg(error))}`);
  }
  revalidatePath('/trainer-dashboard/calendar');
  redirect('/trainer-dashboard/calendar?message=Kalenderinnstillingene+er+lagret');
}

function numberValue(value: FormDataEntryValue | null) {
  const parsed = Number(String(value || '0').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Skriv inn en gyldig pris.');
  return Math.round(parsed);
}

export async function createExternalAppointmentAction(formData: FormData) {
  let appointmentId = '';
  try {
    const { supabase, user } = await trainer();
    const clientId = String(formData.get('clientId') || '') || null;
    const dogId = String(formData.get('dogId') || '') || null;
    const serviceId = String(formData.get('serviceId') || '') || null;
    const title = String(formData.get('title') || '').trim();
    const startsAt = osloLocalInputToIso(String(formData.get('startsAt') || ''));
    const endsAt = osloLocalInputToIso(String(formData.get('endsAt') || ''));
    const source = String(formData.get('source') || 'other');
    const paymentStatus = String(formData.get('paymentStatus') || 'unpaid');
    const priceNok = numberValue(formData.get('priceNok'));
    const notes = String(formData.get('notes') || '').trim();
    const { data, error } = await supabase.rpc('create_external_appointment', {
      p_client_id: clientId,
      p_dog_id: dogId,
      p_service_id: serviceId,
      p_title: title || 'Ekstern avtale',
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_source: source,
      p_payment_status: paymentStatus,
      p_price_nok: priceNok,
      p_notes: notes || null,
      p_sync_to_calendar: formData.get('syncCalendar') === 'on',
    });
    if (error) throw error;
    appointmentId = String(data || '');
    if (appointmentId && formData.get('syncCalendar') === 'on') await syncExternalAppointmentToCalendar(appointmentId);
    await regenerateAllServices(supabase, user.id);
  } catch (error) {
    redirect(`/trainer-dashboard/calendar?error=${encodeURIComponent(msg(error))}#new-appointment`);
  }
  revalidatePath('/trainer-dashboard/calendar');
  revalidatePath('/trainer-dashboard');
  redirect(`/trainer-dashboard/calendar?message=${encodeURIComponent('Den eksterne avtalen er lagt til')}#planner`);
}

export async function updateExternalAppointmentAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  try {
    const { supabase, user } = await trainer();
    const clientId = String(formData.get('clientId') || '') || null;
    const dogId = String(formData.get('dogId') || '') || null;
    const serviceId = String(formData.get('serviceId') || '') || null;
    const title = String(formData.get('title') || '').trim();
    const startsAt = osloLocalInputToIso(String(formData.get('startsAt') || ''));
    const endsAt = osloLocalInputToIso(String(formData.get('endsAt') || ''));
    const source = String(formData.get('source') || 'other');
    const paymentStatus = String(formData.get('paymentStatus') || 'unpaid');
    const priceNok = numberValue(formData.get('priceNok'));
    const notes = String(formData.get('notes') || '').trim();
    const { error } = await supabase.rpc('update_external_appointment', {
      p_id: id,
      p_client_id: clientId,
      p_dog_id: dogId,
      p_service_id: serviceId,
      p_title: title || 'Ekstern avtale',
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_source: source,
      p_payment_status: paymentStatus,
      p_price_nok: priceNok,
      p_notes: notes || null,
      p_sync_to_calendar: formData.get('syncCalendar') === 'on',
    });
    if (error) throw error;
    if (formData.get('syncCalendar') === 'on') await syncExternalAppointmentToCalendar(id);
    else await deleteExternalAppointmentCalendarEvent(id);
    await regenerateAllServices(supabase, user.id);
  } catch (error) {
    redirect(`/trainer-dashboard/calendar?error=${encodeURIComponent(msg(error))}`);
  }
  revalidatePath('/trainer-dashboard/calendar');
  redirect('/trainer-dashboard/calendar?message=Avtalen+er+oppdatert');
}

export async function deleteExternalAppointmentAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  try {
    const { supabase, user } = await trainer();
    const { data: appointment } = await supabase.from('external_appointments').select('id').eq('id', id).eq('trainer_id', user.id).maybeSingle();
    if (!appointment) throw new Error('Fant ikke avtalen.');
    await deleteExternalAppointmentCalendarEvent(id);
    const { error } = await supabase.rpc('delete_external_appointment', { p_id: id });
    if (error) throw error;
    await regenerateAllServices(supabase, user.id);
  } catch (error) {
    redirect(`/trainer-dashboard/calendar?error=${encodeURIComponent(msg(error))}`);
  }
  revalidatePath('/trainer-dashboard/calendar');
  redirect('/trainer-dashboard/calendar?message=Avtalen+er+fjernet');
}
