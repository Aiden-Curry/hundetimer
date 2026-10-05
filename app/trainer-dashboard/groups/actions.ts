'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { osloLocalInputToIso } from '@/lib/oslo-time';
import { notifyGroupCompleted } from '@/lib/email/group-notifications';
import { notifyPendingWaitlistOffers } from '@/lib/email/waitlist-notifications';

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Noe gikk galt.');
  return 'Noe gikk galt.';
}

async function trainerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/groups');
  const { data: trainer } = await supabase.from('trainer_profiles').select('id').eq('id', user.id).maybeSingle();
  if (!trainer) redirect('/trainer-onboarding');
  return { supabase, user };
}

function parseMoney(value: FormDataEntryValue | null) {
  const number = Number(String(value || '').replace(',', '.'));
  if (!Number.isFinite(number) || number < 0) throw new Error('Skriv inn en gyldig pris.');
  return Math.round(number);
}
function parseCapacity(value: FormDataEntryValue | null) {
  const number = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(number) || number < 1 || number > 500) throw new Error('Kapasitet må være mellom 1 og 500.');
  return number;
}
async function regenerateAll(supabase: Awaited<ReturnType<typeof createClient>>, trainerId: string) {
  const { data: services } = await supabase.from('services').select('id').eq('trainer_id', trainerId).eq('active', true);
  for (const service of services || []) await supabase.rpc('regenerate_service_slots', { p_service_id: service.id, p_days: 60 });
}
async function ensureTrainerFree(supabase: Awaited<ReturnType<typeof createClient>>, trainerId: string, startsAt: string, endsAt: string, ignoreOfferingId?: string) {
  const [booked, external, blocked, busy, sessions] = await Promise.all([
    supabase.from('availability_slots').select('id').eq('trainer_id', trainerId).in('status',['held','booked']).lt('starts_at', endsAt).gt('ends_at', startsAt).limit(1),
    supabase.from('external_appointments').select('id').eq('trainer_id', trainerId).lt('starts_at', endsAt).gt('ends_at', startsAt).limit(1),
    supabase.from('availability_exceptions').select('id').eq('trainer_id', trainerId).eq('kind','blocked').lt('starts_at', endsAt).gt('ends_at', startsAt).limit(1),
    supabase.from('calendar_busy_blocks').select('id').eq('trainer_id', trainerId).lt('starts_at', endsAt).gt('ends_at', startsAt).limit(1),
    supabase.from('group_sessions').select('id,offering_id').lt('starts_at', endsAt).gt('ends_at', startsAt),
  ]);
  if (booked.data?.length) throw new Error('Du har allerede en privat booking i dette tidsrommet.');
  if (external.data?.length) throw new Error('Du har allerede en ekstern avtale i dette tidsrommet.');
  if (blocked.data?.length) throw new Error('Tidsrommet er blokkert.');
  if (busy.data?.length) throw new Error('Google Kalender viser at du er opptatt i dette tidsrommet.');
  const offeringIds = (sessions.data || []).map((row) => row.offering_id).filter((id) => id !== ignoreOfferingId);
  if (offeringIds.length) {
    const { data: owned } = await supabase.from('group_offerings').select('id').eq('trainer_id', trainerId).in('id', offeringIds);
    if (owned?.length) throw new Error('Du har allerede et annet kurs eller arrangement i dette tidsrommet.');
  }
}

export async function createGroupOfferingAction(formData: FormData) {
  try {
    const { supabase, user } = await trainerContext();
    const kind = String(formData.get('kind') || 'course');
    const title = String(formData.get('title') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const city = String(formData.get('city') || '').trim();
    const venueName = String(formData.get('venueName') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const tags = String(formData.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const latitude = Number(formData.get('latitude') || '') || null;
    const longitude = Number(formData.get('longitude') || '') || null;
    const isOnline = formData.get('isOnline') === 'on';
    const priceNok = parseMoney(formData.get('priceNok'));
    const capacity = parseCapacity(formData.get('capacity'));
    const startsAt = osloLocalInputToIso(String(formData.get('startsAt') || ''));
    const endsAt = osloLocalInputToIso(String(formData.get('endsAt') || ''));
    if (!['course', 'event'].includes(kind)) throw new Error('Velg kurs eller arrangement.');
    if (!title || !city) throw new Error('Tittel og sted må fylles ut.');
    if (new Date(endsAt) <= new Date(startsAt)) throw new Error('Sluttid må være etter starttid.');
    await ensureTrainerFree(supabase, user.id, startsAt, endsAt);

    const { data: offering, error } = await supabase.from('group_offerings').insert({
      trainer_id: user.id, kind, title, description: description || null, city,
      venue_name: isOnline ? 'På nett' : (venueName || null), address: isOnline ? null : (address || null),
      tags, latitude: isOnline ? null : latitude, longitude: isOnline ? null : longitude,
      is_online: isOnline, price_nok: priceNok, capacity, active: true, updated_at: new Date().toISOString(),
    }).select('id').single();
    if (error || !offering) throw error || new Error('Kunne ikke opprette.');
    const { error: sessionError } = await supabase.from('group_sessions').insert({ offering_id: offering.id, starts_at: startsAt, ends_at: endsAt });
    if (sessionError) throw sessionError;
    await regenerateAll(supabase, user.id);
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  revalidatePath('/trainer-dashboard/groups'); revalidatePath('/trainer-dashboard/calendar'); revalidatePath('/activities');
  redirect('/trainer-dashboard/groups?message=Kurset+eller+arrangementet+er+opprettet');
}

export async function updateGroupOfferingAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  try {
    const { supabase, user } = await trainerContext();
    const kind = String(formData.get('kind') || 'course');
    const title = String(formData.get('title') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const city = String(formData.get('city') || '').trim();
    const venueName = String(formData.get('venueName') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const tags = String(formData.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const latitude = Number(formData.get('latitude') || '') || null;
    const longitude = Number(formData.get('longitude') || '') || null;
    const isOnline = formData.get('isOnline') === 'on';
    const priceNok = parseMoney(formData.get('priceNok'));
    const capacity = parseCapacity(formData.get('capacity'));
    if (!id || !title || !city) throw new Error('Mangler informasjon.');
    const { data: existing } = await supabase.from('group_offerings').select('confirmed_count').eq('id', id).eq('trainer_id', user.id).maybeSingle();
    if (!existing) throw new Error('Fant ikke kurset eller arrangementet.');
    if (capacity < existing.confirmed_count) throw new Error(`Kapasiteten kan ikke settes lavere enn ${existing.confirmed_count} påmeldte.`);
    const { error } = await supabase.from('group_offerings').update({
      kind, title, description: description || null, city,
      venue_name: isOnline ? 'På nett' : (venueName || null), address: isOnline ? null : (address || null),
      tags, latitude: isOnline ? null : latitude, longitude: isOnline ? null : longitude,
      is_online: isOnline, price_nok: priceNok, capacity, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('trainer_id', user.id);
    if (error) throw error;
    await notifyPendingWaitlistOffers(id);
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  revalidatePath('/trainer-dashboard/groups'); revalidatePath('/activities');
  redirect('/trainer-dashboard/groups?message=Endringene+er+lagret');
}

export async function addGroupSessionAction(formData: FormData) {
  const offeringId = String(formData.get('offeringId') || '');
  try {
    const { supabase, user } = await trainerContext();
    const { data: offering } = await supabase.from('group_offerings').select('id').eq('id', offeringId).eq('trainer_id', user.id).maybeSingle();
    if (!offering) throw new Error('Fant ikke kurset eller arrangementet.');
    const startsAt = osloLocalInputToIso(String(formData.get('startsAt') || ''));
    const endsAt = osloLocalInputToIso(String(formData.get('endsAt') || ''));
    const title = String(formData.get('title') || '').trim();
    if (new Date(endsAt) <= new Date(startsAt)) throw new Error('Sluttid må være etter starttid.');
    await ensureTrainerFree(supabase, user.id, startsAt, endsAt, offeringId);
    const { error } = await supabase.from('group_sessions').insert({ offering_id: offeringId, title: title || null, starts_at: startsAt, ends_at: endsAt });
    if (error) throw error;
    await regenerateAll(supabase, user.id);
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  revalidatePath('/trainer-dashboard/groups'); revalidatePath('/trainer-dashboard/calendar'); revalidatePath('/activities');
  redirect('/trainer-dashboard/groups?message=Ny+samling+er+lagt+til');
}

export async function deleteGroupSessionAction(formData: FormData) {
  const sessionId = String(formData.get('sessionId') || '');
  const offeringId = String(formData.get('offeringId') || '');
  try {
    const { supabase, user } = await trainerContext();
    const { data: offering } = await supabase.from('group_offerings').select('confirmed_count').eq('id', offeringId).eq('trainer_id', user.id).maybeSingle();
    if (!offering) throw new Error('Fant ikke kurset eller arrangementet.');
    if (offering.confirmed_count > 0) throw new Error('Datoer kan ikke fjernes etter at noen har meldt seg på.');
    const { error } = await supabase.from('group_sessions').delete().eq('id', sessionId).eq('offering_id', offeringId);
    if (error) throw error;
    await regenerateAll(supabase, user.id);
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  revalidatePath('/trainer-dashboard/groups'); revalidatePath('/trainer-dashboard/calendar'); revalidatePath('/activities');
  redirect('/trainer-dashboard/groups?message=Samlingen+er+fjernet');
}

export async function addManualParticipantAction(formData: FormData) {
  const offeringId = String(formData.get('offeringId') || '');
  try {
    const { supabase } = await trainerContext();
    await createAdminClient().rpc('system_promote_group_waitlist', { p_offering_id: offeringId });
    const { error } = await supabase.rpc('add_manual_group_participant', {
      p_offering_id: offeringId,
      p_client_id: String(formData.get('clientId') || '') || null,
      p_dog_id: String(formData.get('dogId') || '') || null,
      p_customer_name: String(formData.get('customerName') || '').trim(),
      p_dog_name: String(formData.get('dogName') || '').trim(),
      p_source: String(formData.get('source') || 'other'),
      p_payment_status: String(formData.get('paymentStatus') || 'unpaid'),
      p_price_nok: parseMoney(formData.get('priceNok')),
      p_notes: String(formData.get('notes') || '').trim() || null,
    });
    if (error) throw error;
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  revalidatePath('/trainer-dashboard/groups'); revalidatePath('/activities'); revalidatePath('/discover');
  redirect('/trainer-dashboard/groups?message=Ekstern+deltaker+er+lagt+til');
}

export async function removeManualParticipantAction(formData: FormData) {
  const participantId = String(formData.get('participantId') || '');
  try {
    const { supabase } = await trainerContext();
    const { data: offeringId, error } = await supabase.rpc('remove_manual_group_participant', { p_participant_id: participantId });
    if (error) throw error;
    if (offeringId) {
      await createAdminClient().rpc('system_promote_group_waitlist', { p_offering_id: offeringId });
      await notifyPendingWaitlistOffers(String(offeringId));
    }
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  revalidatePath('/trainer-dashboard/groups'); revalidatePath('/activities'); revalidatePath('/discover');
  redirect('/trainer-dashboard/groups?message=Deltakeren+er+fjernet');
}

export async function toggleGroupOfferingAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const active = String(formData.get('active') || '') === 'true';
  try {
    const { supabase, user } = await trainerContext();
    const { error } = await supabase.from('group_offerings').update({ active, updated_at: new Date().toISOString() }).eq('id', id).eq('trainer_id', user.id);
    if (error) throw error;
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  revalidatePath('/trainer-dashboard/groups'); revalidatePath('/activities');
  redirect(`/trainer-dashboard/groups?message=${active ? 'Publisert' : 'Skjult'}`);
}

export async function completeGroupOfferingAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  let completedCount = 0;
  try {
    const { supabase, user } = await trainerContext();
    const { data, error } = await supabase.rpc('complete_group_offering', { p_offering_id: id });
    if (error) throw error;
    completedCount = Number(data || 0);
    await createAdminClient().from('group_manual_participants').update({ status:'completed', updated_at:new Date().toISOString() }).eq('offering_id', id).eq('trainer_id', user.id).eq('status','active');
    const { data: completedEnrollments } = await supabase.from('group_enrollments').select('id').eq('offering_id', id).eq('status', 'completed');
    await Promise.allSettled((completedEnrollments || []).map((enrollment) => notifyGroupCompleted(enrollment.id)));
    revalidatePath('/trainer-dashboard'); revalidatePath('/trainer-dashboard/calendar'); revalidatePath('/admin/payouts'); revalidatePath('/account');
  } catch (error) { redirect(`/trainer-dashboard/groups?error=${encodeURIComponent(messageOf(error))}`); }
  redirect(`/trainer-dashboard/groups?message=${encodeURIComponent(`${completedCount} markedsplass-påmeldinger er fullført og lagt til utbetaling`)}`);
}
