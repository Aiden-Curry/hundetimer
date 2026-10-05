'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type SavedType = 'trainer' | 'service' | 'activity' | 'online_course';
const allowed = new Set<SavedType>(['trainer', 'service', 'activity', 'online_course']);

function safePath(value: FormDataEntryValue | null) {
  const path = typeof value === 'string' ? value : '/saved';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/saved';
}

async function isPublicItem(supabase: Awaited<ReturnType<typeof createClient>>, type: SavedType, id: string) {
  if (type === 'trainer') {
    const { data } = await supabase.from('trainer_profiles').select('id').eq('id', id).eq('verified', true).maybeSingle();
    return Boolean(data);
  }

  if (type === 'service') {
    const { data: service } = await supabase.from('services').select('id, trainer_id').eq('id', id).eq('active', true).maybeSingle();
    if (!service) return false;
    const { data: trainer } = await supabase.from('trainer_profiles').select('id').eq('id', service.trainer_id).eq('verified', true).maybeSingle();
    return Boolean(trainer);
  }

  if (type === 'activity') {
    const { data: activity } = await supabase.from('group_offerings').select('id, trainer_id').eq('id', id).eq('active', true).maybeSingle();
    if (!activity) return false;
    const { data: trainer } = await supabase.from('trainer_profiles').select('id').eq('id', activity.trainer_id).eq('verified', true).maybeSingle();
    return Boolean(trainer);
  }

  const { data: course } = await supabase.from('online_courses').select('id, trainer_id').eq('id', id).eq('published', true).maybeSingle();
  if (!course) return false;
  const { data: trainer } = await supabase.from('trainer_profiles').select('id').eq('id', course.trainer_id).eq('verified', true).maybeSingle();
  return Boolean(trainer);
}

export async function toggleSavedItemAction(formData: FormData) {
  const itemType = String(formData.get('itemType') || '') as SavedType;
  const itemId = String(formData.get('itemId') || '');
  const returnPath = safePath(formData.get('returnPath'));
  if (!allowed.has(itemType) || !itemId) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'owner') return;

  const { data: existing } = await supabase
    .from('saved_items')
    .select('id')
    .eq('owner_id', user.id)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();

  if (existing) {
    await supabase.from('saved_items').delete().eq('id', existing.id).eq('owner_id', user.id);
  } else {
    if (!(await isPublicItem(supabase, itemType, itemId))) return;
    await supabase.from('saved_items').insert({ owner_id: user.id, item_type: itemType, item_id: itemId });
  }

  revalidatePath(returnPath);
  revalidatePath('/saved');
  revalidatePath('/discover');
}
