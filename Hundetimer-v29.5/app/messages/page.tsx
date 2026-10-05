import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type BookingRow = {
  id: string;
  customer_id: string;
  trainer_id: string;
  service_id: string;
  dog_name: string | null;
  requested_starts_at: string;
  status: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

const statusText: Record<string, string> = { pending: 'Venter på trener', confirmed: 'Bekreftet', reschedule_offered: 'Nytt tidspunkt foreslått', completed: 'Fullført', cancelled_by_customer: 'Avbestilt', declined_by_trainer: 'Avslått', refunded: 'Refundert' };

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/messages');

  const { data: bookingData } = await supabase
    .from('bookings')
    .select('id, customer_id, trainer_id, service_id, dog_name, requested_starts_at, status, created_at')
    .or(`customer_id.eq.${user.id},trainer_id.eq.${user.id}`)
    .order('created_at', { ascending: false });
  const bookings = (bookingData || []) as BookingRow[];

  const bookingIds = bookings.map((booking) => booking.id);
  const serviceIds = [...new Set(bookings.map((booking) => booking.service_id))];
  const customerIds = [...new Set(bookings.map((booking) => booking.customer_id))];
  const trainerIds = [...new Set(bookings.map((booking) => booking.trainer_id))];

  const [messageResult, serviceResult, customerResult, trainerResult] = await Promise.all([
    bookingIds.length ? supabase.from('booking_messages').select('id, booking_id, sender_id, body, created_at, read_at').in('booking_id', bookingIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    serviceIds.length ? supabase.from('services').select('id, title').in('id', serviceIds) : Promise.resolve({ data: [] }),
    customerIds.length ? supabase.from('profiles').select('id, display_name').in('id', customerIds) : Promise.resolve({ data: [] }),
    trainerIds.length ? supabase.from('trainer_profiles').select('id, business_name').in('id', trainerIds) : Promise.resolve({ data: [] }),
  ]);

  const messages = (messageResult.data || []) as MessageRow[];
  const services = serviceResult.data || [];
  const customerProfiles = customerResult.data || [];
  const trainerProfiles = trainerResult.data || [];

  const serviceMap = new Map(services.map((item) => [item.id, item.title]));
  const customerMap = new Map(customerProfiles.map((item) => [item.id, item.display_name]));
  const trainerMap = new Map(trainerProfiles.map((item) => [item.id, item.business_name]));
  const lastByBooking = new Map<string, MessageRow>();
  const unreadByBooking = new Map<string, number>();
  for (const message of messages) {
    if (!lastByBooking.has(message.booking_id)) lastByBooking.set(message.booking_id, message);
    if (message.sender_id !== user.id && !message.read_at) unreadByBooking.set(message.booking_id, (unreadByBooking.get(message.booking_id) || 0) + 1);
  }

  return <main className="page-shell narrow messages-inbox"><div className="page-heading"><span className="eyebrow">Meldinger</span><h1>Samtaler om bestillinger</h1><p className="lead">Hold spørsmål, praktisk informasjon og oppfølging samlet med bestillingen.</p></div>
    {bookings.length ? <div className="conversation-list">{bookings.map((booking) => {
      const last = lastByBooking.get(booking.id);
      const unread = unreadByBooking.get(booking.id) || 0;
      const counterpart = booking.trainer_id === user.id ? (customerMap.get(booking.customer_id) || 'Kunde') : (trainerMap.get(booking.trainer_id) || 'Hundetrener');
      return <Link className={`conversation-card ${unread ? 'has-unread' : ''}`} href={`/messages/${booking.id}`} key={booking.id}>
        <div className="conversation-avatar">{counterpart.slice(0, 1).toUpperCase()}</div>
        <div className="conversation-main"><div className="conversation-head"><strong>{counterpart}</strong>{unread ? <span className="unread-badge">{unread}</span> : null}</div><span className="muted small">{booking.dog_name || 'Hund'} · {serviceMap.get(booking.service_id) || 'Hundetrening'} · {statusText[booking.status] || booking.status}</span><p>{last ? last.body : 'Ingen meldinger ennå. Åpne samtalen for å skrive.'}</p></div>
        <div className="conversation-meta"><span>{dateTime(last?.created_at || booking.requested_starts_at)}</span><span>Åpne →</span></div>
      </Link>;
    })}</div> : <div className="empty-state"><h2>Ingen samtaler ennå</h2><p className="muted">Når du har en privat booking, kan du og treneren bruke meldinger her.</p><Link className="btn" href="/discover">Finn trening</Link></div>}
  </main>;
}
