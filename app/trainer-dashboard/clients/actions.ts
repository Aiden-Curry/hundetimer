'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Noe gikk galt.';
}

async function trainerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/clients');
  const { data: trainer } = await supabase.from('trainer_profiles').select('id').eq('id', user.id).maybeSingle();
  if (!trainer) redirect('/trainer-onboarding');
  return { supabase, user };
}

export async function createTrainerClientAction(formData: FormData) {
  try {
    const { supabase, user } = await trainerContext();
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const notes = String(formData.get('notes') || '').trim();
    if (!name) throw new Error('Skriv inn kundenavn.');
    const newsletterOptIn = formData.get('newsletterOptIn') === 'on';
    if (newsletterOptIn && !email) throw new Error('E-post kreves når kunden skal motta nyhetsbrev.');
    const { data: created, error } = await supabase.from('trainer_clients').insert({
      trainer_id: user.id, name, email: email || null, phone: phone || null, notes: notes || null, newsletter_opt_in: newsletterOptIn, updated_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw error;
    if (newsletterOptIn && created && email) {
      const admin=createAdminClient(); await admin.from('newsletter_subscriptions').insert({scope:'trainer',trainer_id:user.id,trainer_client_id:created.id,email,name,source:'external'});
    }
  } catch (error) {
    redirect(`/trainer-dashboard/clients?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard/clients');
  redirect('/trainer-dashboard/clients?message=Kunden+er+lagt+til');
}

export async function createTrainerClientDogAction(formData: FormData) {
  try {
    const { supabase, user } = await trainerContext();
    const clientId = String(formData.get('clientId') || '');
    const name = String(formData.get('name') || '').trim();
    const breed = String(formData.get('breed') || '').trim();
    const birthDate = String(formData.get('birthDate') || '').trim();
    const notes = String(formData.get('notes') || '').trim();
    if (!clientId || !name) throw new Error('Velg kunde og skriv inn hundens navn.');
    const { data: client } = await supabase.from('trainer_clients').select('id').eq('id', clientId).eq('trainer_id', user.id).maybeSingle();
    if (!client) throw new Error('Fant ikke kunden.');
    const { error } = await supabase.from('trainer_client_dogs').insert({
      trainer_id: user.id,
      client_id: clientId,
      name,
      breed: breed || null,
      birth_date: birthDate || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    redirect(`/trainer-dashboard/clients?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard/clients');
  revalidatePath('/trainer-dashboard/calendar');
  redirect('/trainer-dashboard/clients?message=Hunden+er+lagt+til');
}

export async function updateTrainerClientAction(formData: FormData) {
  try {
    const { supabase, user } = await trainerContext();
    const id = String(formData.get('id') || '');
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const notes = String(formData.get('notes') || '').trim();
    if (!id || !name) throw new Error('Mangler kundeinformasjon.');
    const newsletterOptIn = formData.get('newsletterOptIn') === 'on';
    if (newsletterOptIn && !email) throw new Error('E-post kreves når kunden skal motta nyhetsbrev.');
    const { error } = await supabase.from('trainer_clients').update({ name, email: email || null, phone: phone || null, notes: notes || null, newsletter_opt_in: newsletterOptIn, updated_at: new Date().toISOString() }).eq('id', id).eq('trainer_id', user.id);
    if (error) throw error;
    const admin=createAdminClient(); const {data:existing}=await admin.from('newsletter_subscriptions').select('id').eq('scope','trainer').eq('trainer_id',user.id).eq('trainer_client_id',id).maybeSingle();
    if(newsletterOptIn && email){const row={email,name,source:'external',subscribed_at:new Date().toISOString(),unsubscribed_at:null,updated_at:new Date().toISOString()};if(existing)await admin.from('newsletter_subscriptions').update(row).eq('id',existing.id);else await admin.from('newsletter_subscriptions').insert({scope:'trainer',trainer_id:user.id,trainer_client_id:id,...row});}else if(existing){await admin.from('newsletter_subscriptions').update({unsubscribed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',existing.id);}
  } catch (error) {
    redirect(`/trainer-dashboard/clients?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath('/trainer-dashboard/clients');
  redirect('/trainer-dashboard/clients?message=Kunden+er+oppdatert');
}
