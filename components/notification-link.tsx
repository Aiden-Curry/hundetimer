'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function NotificationLink({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const refresh = async () => {
      const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null);
      if (active && !error) setUnread(count || 0);
    };
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [userId]);

  return <Link className="nav-notification-link" href="/notifications">Varsler{unread ? <span className="nav-unread-badge">{unread > 99 ? '99+' : unread}</span> : null}</Link>;
}
