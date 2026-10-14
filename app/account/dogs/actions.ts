'use server';

import { randomUUID } from 'node:crypto';
import { parseDogWeight, validateDogPhoto, DOG_PHOTO_BUCKET } from '@/lib/dogs';
import { safeAuthNext } from '@/lib/auth-next';
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
  return { supabase, user };
}

export async function saveDogAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const breed = String(formData.get('breed') || '').trim();
  const birthDate = String(formData.get('birthDate') || '').trim();
  const sex = String(formData.get('sex') || 'unknown');
  const weightRaw = String(formData.get('weightKg') || '');
  const notes = String(formData.get('notes') || '').trim();
  const next = String(formData.get('next') || '').trim();

  try {
    if (!name) throw new Error('Hunden må ha et navn.');
    if (!['female', 'male', 'unknown'].includes(sex)) throw new Error('Ugyldig kjønn.');
    const weightKg = parseDogWeight(weightRaw);
    const { supabase, user } = await ownerContext();
    const dogId = id || randomUUID();
    let oldPhoto: string | null = null;
    if (id) {
      const { data: dog, error } = await supabase.from('dogs').select('photo_path').eq('id', id).eq('owner_id', user.id).single();
      if (error || !dog) throw new Error('Fant ikke hunden.');
      oldPhoto = dog.photo_path;
    }
    const photo = formData.get('photo');
    const file = photo instanceof File && photo.size ? photo : null;
    const extension = file ? await validateDogPhoto(file) : null;
    let photoPath = formData.get('removePhoto') === 'on' ? null : oldPhoto;
    if (file && extension) {
      photoPath = [user.id, dogId, randomUUID() + '.' + extension].join('/');
      const { error } = await supabase.storage.from(DOG_PHOTO_BUCKET).upload(photoPath, file, { contentType: file.type, upsert: false });
      if (error) throw error;
    }
    const payload = {
      owner_id: user.id,
      photo_path: photoPath,
      name,
      breed: breed || null,
      birth_date: birthDate || null,
      sex,
      weight_kg: weightKg,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    const result = id
      ? await supabase.from('dogs').update(payload).eq('id', id).eq('owner_id', user.id).select('id').single()
      : await supabase.from('dogs').insert({ ...payload, id: dogId }).select('id').single();
    if (result.error) {
      if (file && photoPath) await supabase.storage.from(DOG_PHOTO_BUCKET).remove([photoPath]);
      throw result.error;
    }
    if (oldPhoto && oldPhoto !== photoPath) {
      const { error } = await supabase.storage.from(DOG_PHOTO_BUCKET).remove([oldPhoto]);
      if (error) console.error('[dog photo cleanup]', error);
    }
  } catch (error) {
    const suffix = next ? `&next=${encodeURIComponent(next)}` : '';
    redirect(`/account/dogs?error=${encodeURIComponent(messageOf(error))}${suffix}`);
  }

  revalidatePath('/account');
  revalidatePath('/account/dogs');
  if (next) redirect(safeAuthNext(next, '/account/dogs'));
  redirect('/account/dogs?message=Lagret');
}

export async function deleteDogAction(formData: FormData) {
  const id = String(formData.get('id') || '').trim();
  try {
    if (!id) throw new Error('Fant ikke hunden.');
    const { supabase, user } = await ownerContext();
    const { data: dog, error: dogError } = await supabase.from('dogs').select('photo_path').eq('id', id).eq('owner_id', user.id).single();
    if (dogError || !dog) throw new Error('Fant ikke hunden.');
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
    if (dog.photo_path) {
      const { error: photoError } = await supabase.storage.from(DOG_PHOTO_BUCKET).remove([dog.photo_path]);
      if (photoError) console.error('[dog photo cleanup]', photoError);
    }
  } catch (error) {
    redirect(`/account/dogs?error=${encodeURIComponent(messageOf(error))}`);
  }
  revalidatePath('/account');
  revalidatePath('/account/dogs');
  redirect('/account/dogs?message=Hunden+er+fjernet');
}
