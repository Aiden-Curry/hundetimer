import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { markAllNotificationsReadAction, openNotificationAction } from './actions';

export const dynamic = 'force-dynamic';

const labels: Record<string, string> = {
  booking: 'Booking',
  message: 'Melding',
  course: 'Kurs',
  review: 'Vurdering',
  verification: 'Verifisering',
  payout: 'Utbetaling',
  refund: 'Refusjon',
  system: 'System',
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');

  let query = supabase.from('notifications').select('id, type, title, body, href, read_at, created_at').order('created_at', { ascending: false }).limit(100);
  if (params.filter === 'unread') query = query.is('read_at', null);
  const { data: notifications } = await query;
  const { count: unreadCount } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);

  return (
    <main className="shell notifications-page">
      <div className="page-heading notification-heading">
        <div><span className="eyebrow">Konto</span><h1>Varsler</h1><p className="muted">Bookinger, meldinger, kurs, vurderinger og utbetalinger samlet på ett sted.</p></div>
        {unreadCount ? <form action={markAllNotificationsReadAction}><button className="btn secondary" type="submit">Marker alle som lest</button></form> : null}
      </div>

      <div className="notification-filters">
        <Link className={params.filter !== 'unread' ? 'active' : ''} href="/notifications">Alle</Link>
        <Link className={params.filter === 'unread' ? 'active' : ''} href="/notifications?filter=unread">Uleste{unreadCount ? ` (${unreadCount})` : ''}</Link>
      </div>

      {notifications?.length ? (
        <div className="notification-list">
          {notifications.map((item) => (
            <form action={openNotificationAction} key={item.id}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="href" value={item.href || '/notifications'} />
              <button className={`notification-row ${item.read_at ? '' : 'unread'}`} type="submit">
                <span className={`notification-dot type-${item.type}`} aria-hidden="true" />
                <span className="notification-copy">
                  <span className="notification-meta"><strong>{labels[item.type] || 'Varsel'}</strong><time>{dateTime(item.created_at)}</time></span>
                  <span className="notification-title">{item.title}</span>
                  {item.body ? <span className="notification-body">{item.body}</span> : null}
                </span>
                {!item.read_at ? <span className="notification-new">Ny</span> : null}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <div className="empty-state"><h2>{params.filter === 'unread' ? 'Ingen uleste varsler' : 'Ingen varsler ennå'}</h2><p className="muted">Når noe viktig skjer, dukker det opp her.</p></div>
      )}
    </main>
  );
}
