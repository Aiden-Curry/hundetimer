import { CustomerNavigation } from '@/components/customer-navigation';
import '@/components/customer-pages.css';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { markAllNotificationsReadAction, openNotificationAction, setNotificationReadStateAction } from './actions';

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

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');

  let query = supabase.from('notifications').select('id, type, title, body, href, read_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (params.filter === 'unread') query = query.is('read_at', null);
  const { data: notifications } = await query;
  const { count: unreadCount } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null);

  return (
    <main className="page-shell notifications-page customer-page"><CustomerNavigation current="/notifications" />
      <div className="page-heading notification-heading">
        <div><span className="eyebrow">Konto</span><h1>Varsler</h1><p className="muted">Bookinger, meldinger, kurs, vurderinger og utbetalinger samlet på ett sted.</p></div>
        {unreadCount ? <form action={markAllNotificationsReadAction}><button className="btn secondary" type="submit">Marker alle som lest</button></form> : null}
      </div>

      {params.error && <p className="form-error" role="alert">Kunne ikke oppdatere varselet. Prøv igjen.</p>}
      <nav className="notification-filters" aria-label="Filtrer varsler">
        <Link aria-current={params.filter !== 'unread' ? 'page' : undefined} className={params.filter !== 'unread' ? 'active' : ''} href="/notifications">Alle</Link>
        <Link aria-current={params.filter === 'unread' ? 'page' : undefined} className={params.filter === 'unread' ? 'active' : ''} href="/notifications?filter=unread">Uleste{unreadCount ? ` (${unreadCount})` : ''}</Link>
      </nav>

      {notifications?.length ? (
        <div className="notification-list">
          {notifications.map((item) => (
            <article className={`notification-row ${item.read_at ? '' : 'unread'}`} key={item.id}>
              <form action={openNotificationAction} className="notification-open-form">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="href" value={item.href || '/notifications'} />
                <button className="notification-open-button" type="submit" aria-label={`Åpne varsel: ${item.title}`}>
                  <span className={`notification-dot type-${item.type}`} aria-hidden="true" />
                  <span className="notification-copy">
                    <span className="notification-meta"><strong>{labels[item.type] || 'Varsel'}</strong><time dateTime={item.created_at}>{dateTime(item.created_at)}</time></span>
                    <span className="notification-title">{item.title}</span>
                    {item.body ? <span className="notification-body">{item.body}</span> : null}
                  </span>
                  {!item.read_at ? <span className="notification-new">Ny</span> : null}
                </button>
              </form>
              <form action={setNotificationReadStateAction} className="notification-read-form">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="read" value={item.read_at ? 'false' : 'true'} />
                <button className="notification-read-toggle" type="submit">
                  {item.read_at ? 'Marker som ulest' : 'Marker som lest'}
                </button>
              </form>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><h2>{params.filter === 'unread' ? 'Ingen uleste varsler' : 'Ingen varsler ennå'}</h2><p className="muted">Når noe viktig skjer, dukker det opp her.</p></div>
      )}
    </main>
  );
}
