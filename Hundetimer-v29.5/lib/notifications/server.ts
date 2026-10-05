import { createAdminClient } from '@/lib/supabase/admin';

export type NotificationType =
  | 'booking'
  | 'message'
  | 'course'
  | 'review'
  | 'verification'
  | 'payout'
  | 'refund'
  | 'system';

export async function createNotification(options: {
  userId: string | null | undefined;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  eventKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!options.userId) return null;
  const admin = createAdminClient();
  const row = {
    user_id: options.userId,
    type: options.type,
    title: options.title.slice(0, 180),
    body: options.body?.slice(0, 1200) || null,
    href: options.href?.startsWith('/') ? options.href : null,
    event_key: options.eventKey || null,
    metadata: options.metadata || {},
  };

  if (row.event_key) {
    const { data, error } = await admin
      .from('notifications')
      .upsert(row, { onConflict: 'user_id,event_key', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();
    if (error && error.code !== '23505') throw error;
    return data?.id || null;
  }

  const { data, error } = await admin.from('notifications').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function bestEffortNotification(options: Parameters<typeof createNotification>[0]) {
  try {
    return await createNotification(options);
  } catch (error) {
    console.error('[notification]', error);
    return null;
  }
}
