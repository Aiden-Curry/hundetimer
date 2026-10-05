import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BookingChat } from '@/components/booking-chat';
import { createClient } from '@/lib/supabase/server';

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

export default async function MessageThreadPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/messages/${bookingId}`)}`);

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id, trainer_id, service_id, dog_name, requested_starts_at, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || ![booking.customer_id, booking.trainer_id].includes(user.id)) notFound();

  await supabase.rpc('mark_booking_messages_read', { p_booking_id: booking.id });

  const [{ data: messages }, { data: service }, { data: customer }, { data: trainer }] = await Promise.all([
    supabase.from('booking_messages').select('id, booking_id, sender_id, body, created_at, read_at').eq('booking_id', booking.id).order('created_at', { ascending: true }),
    supabase.from('services').select('title').eq('id', booking.service_id).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', booking.customer_id).maybeSingle(),
    supabase.from('trainer_profiles').select('business_name').eq('id', booking.trainer_id).maybeSingle(),
  ]);

  const counterpart = booking.trainer_id === user.id ? (customer?.display_name || 'Kunde') : (trainer?.business_name || 'Hundetrener');

  return <main className="page-shell narrow message-thread-page"><div className="message-thread-header"><div><Link className="text-link" href="/messages">← Alle meldinger</Link><span className="eyebrow">Booking-samtale</span><h1>{counterpart}</h1><p className="muted">{booking.dog_name || 'Hund'} · {service?.title || 'Hundetrening'} · {dateTime(booking.requested_starts_at)}</p></div><Link className="btn secondary compact" href={`/booking/${booking.id}`}>Se bestilling</Link></div>
    <BookingChat bookingId={booking.id} userId={user.id} initialMessages={(messages || []) as Array<{ id: string; booking_id: string; sender_id: string; body: string; created_at: string; read_at: string | null }>} />
  </main>;
}
