'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAuthNext } from '@/lib/auth-next';

function safeHref(value: string) {
  return safeAuthNext(value, '/notifications');
}

export async function openNotificationAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const href = safeHref(String(formData.get('href') || '/notifications'));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');
  if (id) {
    const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id });
    if (error) redirect('/notifications?error=read');
  }
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
  redirect(href);
}

export async function setNotificationReadStateAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const read = String(formData.get('read') || '') === 'true';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');

  if (id) {
    const { error } = await supabase.rpc('set_notification_read_state', {
      p_notification_id: id,
      p_read: read,
    });
    if (error) redirect('/notifications?error=read');
  }

  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) redirect('/notifications?error=read');
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
  redirect('/notifications');
}
