import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { signOut } from '@/app/auth/actions';
import { NotificationLink } from '@/components/notification-link';

export async function AuthNav() {
  if (!isSupabaseConfigured()) {
    return <Link className="nav-login-link" href="/login">Logg inn</Link>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <Link className="nav-login-link" href="/login">Logg inn</Link>;
  }

  const [{ data: profile }, unreadMessageResult, unreadNotificationResult, savedResult] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('booking_messages').select('id', { count: 'exact', head: true }).neq('sender_id', user.id).is('read_at', null),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    supabase.from('saved_items').select('id', { count: 'exact', head: true }),
  ]);
  const unreadMessages = unreadMessageResult.count || 0;
  const unreadNotifications = unreadNotificationResult.count || 0;
  const savedCount = savedResult.count || 0;

  return (
    <div className="auth-nav">
      <NotificationLink userId={user.id} initialUnread={unreadNotifications} />
      {profile?.role === 'owner' ? <Link className="nav-message-link" href="/saved">Lagret{savedCount ? <span className="nav-unread-badge saved-count">{savedCount > 99 ? '99+' : savedCount}</span> : null}</Link> : null}
      <Link className="nav-message-link" href="/messages">Meldinger{unreadMessages ? <span className="nav-unread-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span> : null}</Link>
      <Link href={profile?.role === 'admin' ? '/admin/moderation' : profile?.role === 'trainer' ? '/trainer-dashboard' : '/account'}>{profile?.role === 'admin' ? 'Admin' : 'Min side'}</Link>
      <form action={signOut}>
        <button className="nav-login" type="submit">Logg ut</button>
      </form>
    </div>
  );
}
