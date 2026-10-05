'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function createOnlineCourseAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/online-courses');
  const title = String(formData.get('title') || '').trim();
  if (!title) redirect('/trainer-dashboard/online-courses?error=Kurset+m%C3%A5+ha+en+tittel');
  const base = slugify(title) || 'nettkurs';
  const slug = `${base}-${Math.random().toString(36).slice(2,7)}`;
  const { data, error } = await supabase.from('online_courses').insert({ trainer_id: user.id, title, slug, price_nok: 0 }).select('id').single();
  if (error || !data) redirect(`/trainer-dashboard/online-courses?error=${encodeURIComponent(error?.message || 'Kunne ikke opprette kurset')}`);
  redirect(`/trainer-dashboard/online-courses/${data.id}`);
}
