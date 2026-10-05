'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function NotificationLink({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => setUnread((value) => value + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  return <Link className="nav-notification-link" href="/notifications">Varsler{unread ? <span className="nav-unread-badge">{unread > 99 ? '99+' : unread}</span> : null}</Link>;
}
