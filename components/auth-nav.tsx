import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { signOut } from '@/app/auth/actions';
import { NotificationLink } from '@/components/notification-link';
import { ProfileMenu } from '@/components/profile-menu';

export async function AuthNav() {
  if (!isSupabaseConfigured()) {
    return <Link className="nav-login-link" href="/login">Logg inn</Link>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <Link className="nav-login-link" href="/login">Logg inn</Link>;
  }

  const [{ data: profile }, { data: trainerProfile }, unreadMessageResult, unreadNotificationResult, savedResult] = await Promise.all([
    supabase.from('profiles').select('role, display_name').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('profile_image_url, verification_status').eq('id', user.id).maybeSingle(),
    supabase.from('booking_messages').select('id', { count: 'exact', head: true }).neq('sender_id', user.id).is('read_at', null),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null),
    supabase.from('saved_items').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
  ]);

  const unreadMessages = unreadMessageResult.count || 0;
  const unreadNotifications = unreadNotificationResult.count || 0;
  const savedCount = savedResult.count || 0;
  const isAdmin = profile?.role === 'admin';
  const isTrainer = profile?.role === 'trainer' && trainerProfile?.verification_status === 'approved';
  const displayName = profile?.display_name || user.email?.split('@')[0] || 'Bruker';
  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'B';
  const profileImage = trainerProfile?.profile_image_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

  return (
    <div className="auth-nav">
      <ProfileMenu>
        <summary className="profile-menu-trigger" aria-label={`Åpne konto for ${displayName}`}>
          <span className="profile-menu-avatar" aria-hidden="true">
            {profileImage ? <img src={profileImage} alt="" /> : initial}
          </span>
          {(unreadMessages || unreadNotifications) ? <span className="profile-menu-alert" aria-label="Du har nye varsler" /> : null}
        </summary>

        <div className="profile-menu-dropdown">
          <div className="profile-menu-identity">
            <strong>{displayName}</strong>
            {user.email ? <span>{user.email}</span> : null}
          </div>

          <nav className="profile-menu-links" aria-label="Konto">
            <Link className="profile-menu-link" href={isAdmin ? '/admin' : '/account'}>{isAdmin ? 'Admin' : 'Min side'}</Link>
            {!isAdmin ? <><Link className="profile-menu-link" href="/account/dogs">Mine hunder</Link><Link className="profile-menu-link" href="/account#nettkurs">Mine kurs</Link><Link className="profile-menu-link" href="/saved"><span>Lagret</span>{savedCount ? <span className="profile-menu-count">{savedCount > 99 ? '99+' : savedCount}</span> : null}</Link></> : null}
            <Link className="profile-menu-link" href="/messages"><span>Meldinger</span>{unreadMessages ? <span className="profile-menu-count">{unreadMessages > 99 ? '99+' : unreadMessages}</span> : null}</Link>
            <NotificationLink userId={user.id} initialUnread={unreadNotifications} />
            <Link className="profile-menu-link" href="/account/privacy">Personvern og konto</Link>
            {trainerProfile && !isTrainer && !isAdmin ? <Link className="profile-menu-link" href="/trainer-dashboard/verification">Søknad og trenerstatus</Link> : null}
            {isTrainer ? <Link className="profile-menu-link" href="/trainer-dashboard">Trenerdashboard</Link> : null}
          </nav>

          <form className="profile-menu-logout" action={signOut}>
            <button type="submit">Logg ut</button>
          </form>
        </div>
      </ProfileMenu>
    </div>
  );
}
