'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function safeHref(value: string) {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/notifications';
}

export async function openNotificationAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const href = safeHref(String(formData.get('href') || '/notifications'));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');
  if (id) await supabase.rpc('mark_notification_read', { p_notification_id: id });
  revalidatePath('/notifications');
  redirect(href);
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');
  await supabase.rpc('mark_all_notifications_read');
  revalidatePath('/notifications');
  redirect('/notifications');
}
