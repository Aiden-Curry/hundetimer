'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { osloLocalInputToIso } from '@/lib/oslo-time';

function msg(error: unknown) {
  return error instanceof Error ? error.message : 'Noe gikk galt.';
}

async function trainerUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/promotions');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'trainer') throw new Error('Bare trenerkontoer kan opprette rabattkoder.');
  return { supabase, user };
}

function nullableInt(value: FormDataEntryValue | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Antallsgrenser må være positive heltall.');
  return n;
}

function targetFrom(formData: FormData, appliesTo: string) {
  const raw = String(formData.get('target') || '').trim();
  if (!raw) return null;
  const [prefix, id] = raw.split(':');
  const expected = appliesTo === 'private' ? 'private' : appliesTo === 'group' ? 'group' : appliesTo === 'online_course' ? 'online' : null;
  if (!expected || prefix !== expected || !id) throw new Error('Det valgte produktet passer ikke med kampanjetypen.');
  return id;
}

export async function createPromotionAction(formData: FormData) {
  try {
    const { supabase, user } = await trainerUser();
    const name = String(formData.get('name') || '').trim();
    const code = String(formData.get('code') || '').trim().toUpperCase().replace(/\s+/g, '');
    const discountType = String(formData.get('discountType') || 'percent');
    const discountValue = Number(formData.get('discountValue') || 0);
    let appliesTo = String(formData.get('appliesTo') || 'all');
    const minimumSubtotal = Math.max(0, Number(formData.get('minimumSubtotal') || 0));
    const maxRedemptions = nullableInt(formData.get('maxRedemptions'));
    const perCustomer = Math.max(1, Number(formData.get('perCustomer') || 1));
    const startsRaw = String(formData.get('startsAt') || '').trim();
    const endsRaw = String(formData.get('endsAt') || '').trim();
    const rawTarget = String(formData.get('target') || '').trim();
    if (rawTarget && appliesTo === 'all') {
      const prefix = rawTarget.split(':')[0];
      appliesTo = prefix === 'private' ? 'private' : prefix === 'group' ? 'group' : prefix === 'online' ? 'online_course' : appliesTo;
    }
    const targetId = targetFrom(formData, appliesTo);

    if (!name) throw new Error('Gi kampanjen et navn.');
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error('Koden må være 3-32 tegn og kan bruke bokstaver, tall, bindestrek og understrek.');
    if (!['percent', 'fixed'].includes(discountType)) throw new Error('Ugyldig rabatttype.');
    if (!Number.isInteger(discountValue) || discountValue <= 0) throw new Error('Rabatten må være større enn 0.');
    if (discountType === 'percent' && discountValue > 100) throw new Error('Prosent rabatt kan ikke være over 100%.');
    if (!['all', 'private', 'group', 'online_course'].includes(appliesTo)) throw new Error('Ugyldig kampanjetype.');
    if (!Number.isInteger(perCustomer) || perCustomer < 1) throw new Error('Bruk per kunde må være minst 1.');

    const { error } = await supabase.from('promotions').insert({
      trainer_id: user.id,
      name,
      code,
      discount_type: discountType,
      discount_value: discountValue,
      applies_to: appliesTo,
      target_id: targetId,
      minimum_subtotal_nok: minimumSubtotal,
      max_redemptions: maxRedemptions,
      max_redemptions_per_customer: perCustomer,
      starts_at: startsRaw ? osloLocalInputToIso(startsRaw) : null,
      ends_at: endsRaw ? osloLocalInputToIso(endsRaw) : null,
      active: true,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === '23505') throw new Error('Du har allerede en rabattkode med dette navnet/koden.');
      throw error;
    }
  } catch (error) {
    redirect(`/trainer-dashboard/promotions?error=${encodeURIComponent(msg(error))}`);
  }
  revalidatePath('/trainer-dashboard/promotions');
  redirect('/trainer-dashboard/promotions?message=Rabattkoden+er+opprettet');
}

export async function togglePromotionAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const active = String(formData.get('active') || '') === 'true';
  try {
    const { supabase, user } = await trainerUser();
    const { error } = await supabase.from('promotions').update({ active, updated_at: new Date().toISOString() }).eq('id', id).eq('trainer_id', user.id);
    if (error) throw error;
  } catch (error) {
    redirect(`/trainer-dashboard/promotions?error=${encodeURIComponent(msg(error))}`);
  }
  revalidatePath('/trainer-dashboard/promotions');
  redirect(`/trainer-dashboard/promotions?message=${active ? 'Rabattkoden+er+aktivert' : 'Rabattkoden+er+pauset'}`);
}
