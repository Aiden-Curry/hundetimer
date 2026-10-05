'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Noe gikk galt.');
  return 'Noe gikk galt.';
}

async function ownerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/dogs');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'trainer') redirect('/trainer-dashboard');
  return { supabase, user };
}

export async function saveDogAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const breed = String(formData.get('breed') || '').trim();
  const birthDate = String(formData.get('birthDate') || '').trim();
  const sex = String(formData.get('sex') || 'unknown');
  const weightRaw = String(formData.get('weightKg') || '').trim().replace(',', '.');
  const notes = String(formData.get('notes') || '').trim();
  const next = String(formData.get('next') || '').trim();

  try {
    if (!name) throw new Error('Hunden må ha et navn.');
    if (!['female', 'male', 'unknown'].includes(sex)) throw new Error('Ugyldig kjønn.');
    const weightKg = weightRaw ? Number(weightRaw) : null;
    if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 250)) throw new Error('Skriv inn en gyldig vekt.');

    const { supabase, user } = await ownerContext();
    const payload = {
      owner_id: user.id,
      name,
      breed: breed || null,
      birth_date: birthDate || null,
      sex,
      weight_kg: weightKg,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const { error } = await supabase.from('dogs').update(payload).eq('id', id).eq('owner_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('dogs').insert(payload);
      if (error) throw error;
    }
  } catch (error) {
    const suffix = next ? `&next=${encodeURIComponent(next)}` : '';
    redirect(`/account/dogs?error=${encodeURIComponent(messageOf(error))}${suffix}`);
  }

  revalidatePath('/account');
  revalidatePath('/account/dogs');
  if (next && next.startsWith('/')) redirect(next);
  redirect('/account/dogs?message=Lagret');
}

export async function deleteDogAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  try {
    if (!id) throw new Error('Fant ikke hunden.');
    const { supabase, user } = await ownerContext();
    const { data: activeBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('customer_id', user.id)
      .eq('dog_id', id)
      .in('status', ['pending', 'confirmed', 'reschedule_offered'])
      .limit(1);
    if (bookingError) throw bookingError;
    if (activeBookings?.length) throw new Error('Hunden har en aktiv bestilling og kan ikke fjernes ennå.');
    const { data: activeEnrollments, error: enrollmentError } = await supabase
      .from('group_enrollments')
      .select('id')
      .eq('customer_id', user.id)
      .eq('dog_id', id)
      .in('status', ['checkout_pending', 'confirmed'])
      .limit(1);
    if (enrollmentError) throw enrollmentError;
    if (activeEnrollments?.length) throw new Error('Hunden er påmeldt et kommende kurs eller arrangement og kan ikke fjernes ennå.');
    const { data: activeWaitlist, error: waitlistError } = await supabase
      .from('group_waitlist')
      .select('id')
      .eq('customer_id', user.id)
      .eq('dog_id', id)
      .in('status', ['waiting', 'offered', 'checkout'])
      .limit(1);
    if (waitlistError) throw waitlistError;
    if (activeWaitlist?.length) throw new Error('Hunden står på en aktiv venteliste og kan ikke fjernes ennå.');
    const { error } = await supabase.from('dogs').delete().eq('id', id).eq('owner_id', user.id);
    if (error) throw error;
  } catch (error) {
    redirect(`/account/dogs?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/account');
  revalidatePath('/account/dogs');
  redirect('/account/dogs?message=Hunden+er+fjernet');
}
