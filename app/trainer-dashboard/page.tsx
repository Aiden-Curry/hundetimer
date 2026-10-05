import { osloLocalInputToIso } from '@/lib/oslo-time';
import { stripePayoutReady } from '@/lib/trainer-journey';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Plus,
  Star,
  WalletCards,
  GraduationCap,
  MonitorPlay,
  Tag,
} from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { isStripeConfigured } from '@/lib/stripe/server';
import {
  confirmBookingAction,
  declineBookingAction,
  offerRescheduleAction,
  markBookingCompletedAction,
} from './actions';

function money(value: number) {
  return new Intl.NumberFormat('nb-NO').format(value) + ' kr';
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' }).format(new Date(`${value}T12:00:00+02:00`));
}

function osloDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default async function TrainerDashboardPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  if (!isSupabaseConfigured()) {
    return <main className="dashboard"><section className="setup-card"><h1>Oversikten er midlertidig utilgjengelig</h1><p className="muted">Prøv igjen litt senere, eller kontakt Hundetimer.</p></section></main>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard');

  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = osloDateKey(now);
  const dayStart = osloLocalInputToIso(`${todayKey}T00:00`);
  const [
    { data: profile },
    { data: trainer },
    { data: payoutProfile },
    { data: ledger },
    { data: services },
    { data: slots },
    { data: bookings },
    { data: reviews },
    { data: externalAppointments },
    { data: offerings },
  ] = await Promise.all([
    supabase.from('profiles').select('display_name, role').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_profiles').select('business_name, city, slug, verification_status, verification_review_note').eq('id', user.id).maybeSingle(),
    supabase.from('trainer_payment_accounts').select('stripe_account_id,details_submitted,payouts_enabled,transfers_active').eq('trainer_id', user.id).maybeSingle(),
    supabase.from('trainer_ledger').select('amount_nok, status, scheduled_payout_date').eq('trainer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('services').select('id, title, active, duration_minutes').eq('trainer_id', user.id).order('created_at'),
    supabase.from('availability_slots').select('id, service_id, starts_at, ends_at').eq('trainer_id', user.id).eq('status', 'open').gte('starts_at', nowIso).order('starts_at').limit(120),
    supabase.from('bookings').select('id, customer_id, status, payment_status, requested_starts_at, service_id, dog_name, trainer_response_due_at').eq('trainer_id', user.id).order('requested_starts_at'),
    supabase.from('reviews').select('id, customer_id, service_id, rating, comment, trainer_reply, created_at').eq('trainer_id', user.id).eq('moderation_status', 'visible').order('created_at', { ascending: false }),
    supabase.from('external_appointments').select('id,title,starts_at,ends_at').eq('trainer_id', user.id).gte('ends_at', dayStart).order('starts_at'),
    supabase.from('group_offerings').select('id,title').eq('trainer_id', user.id).eq('active', true).is('completed_at', null),
  ]);

  if (profile?.role !== 'trainer' || !trainer) redirect('/trainer-onboarding');

  const offeringIds = (offerings || []).map(o => o.id);
  const { data: groupSessions } = offeringIds.length ? await supabase.from('group_sessions').select('id,offering_id,title,starts_at,ends_at').in('offering_id', offeringIds).gte('ends_at', nowIso).order('starts_at') : { data: [] };
  const customerIds = [...new Set((bookings || []).map((booking) => booking.customer_id).concat((reviews || []).map((review) => review.customer_id)))];
  const { data: customers } = customerIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', customerIds)
    : { data: [] as { id: string; display_name: string }[] };

  const customerMap = new Map((customers || []).map((customer) => [customer.id, customer.display_name]));
  const serviceMap = new Map((services || []).map((service) => [service.id, service.title]));

  const pending = (bookings || []).filter((booking) => booking.status === 'pending' && booking.payment_status === 'authorized');
  const waitingForCustomer = (bookings || []).filter((booking) => booking.status === 'reschedule_offered' && booking.payment_status === 'authorized');
  const upcoming = (bookings || []).filter((booking) => ['confirmed', 'completed'].includes(booking.status) && (new Date(booking.requested_starts_at) >= now || osloDateKey(booking.requested_starts_at) === todayKey)).sort((a, b) => +new Date(a.requested_starts_at) - +new Date(b.requested_starts_at));
  const readyToComplete = (bookings || []).filter((booking) => booking.status === 'confirmed' && booking.payment_status === 'captured' && new Date(booking.requested_starts_at).getTime() + ((services || []).find(s => s.id === booking.service_id)?.duration_minutes || 60) * 60000 <= now.getTime());
  const appointments = [
    ...upcoming.map(b => ({ id: 'booking-' + b.id, startsAt: b.requested_starts_at, title: b.dog_name || 'Privattime', subtitle: (serviceMap.get(b.service_id) || 'Privattime') + ' · ' + (customerMap.get(b.customer_id) || 'Kunde'), href: '/trainer-dashboard/journal/booking/' + b.id })),
    ...(externalAppointments || []).map(a => ({ id: 'external-' + a.id, startsAt: a.starts_at, title: a.title, subtitle: 'Ekstern avtale', href: '/trainer-dashboard/journal/external/' + a.id })),
    ...(groupSessions || []).map(a => ({ id: 'group-' + a.id, startsAt: a.starts_at, title: (offerings || []).find(o => o.id === a.offering_id)?.title || 'Gruppeaktivitet', subtitle: a.title || 'Samling', href: '/trainer-dashboard/groups' })),
  ].sort((a,b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const todayBookings = appointments.filter(a => osloDateKey(a.startsAt) === todayKey);
  const agenda = todayBookings.length ? todayBookings : appointments.filter(a => new Date(a.startsAt) >= now).slice(0, 5);

  const eligibleLedger = (ledger || []).filter((entry) => ['eligible', 'batched'].includes(entry.status));
  const balance = eligibleLedger.reduce((sum, entry) => sum + entry.amount_nok, 0);
  const nextPayout = [...eligibleLedger].filter((entry) => entry.scheduled_payout_date).sort((a, b) => String(a.scheduled_payout_date).localeCompare(String(b.scheduled_payout_date)))[0]?.scheduled_payout_date;
  const reviewCount = (reviews || []).length;
  const ratingAverage = reviewCount ? (reviews || []).reduce((sum, review) => sum + review.rating, 0) / reviewCount : null;
  const activeServices = (services || []).filter((service) => service.active).length;
  const taskCount = (activeServices ? 0 : 1) + pending.length + readyToComplete.length + (trainer.verification_status === 'approved' ? 0 : 1) + (stripePayoutReady(payoutProfile) ? 0 : 1);

  return (
    <main className="dashboard trainer-overview-page">
      <section className="trainer-overview-header">
        <div>
          <span className="eyebrow">Oversikt</span>
          <h1>Hei, {trainer.business_name || profile.display_name}</h1>
          <p className="muted">Avtalene dine, nye forespørsler og det som trenger et svar.</p>
          {message ? <p className="form-success dashboard-flash">{message}</p> : null}
          {error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}
        </div>
        <div className="trainer-overview-primary-actions">
          <Link className="btn secondary" href="/trainer-dashboard/calendar"><CalendarDays size={17} /> Åpne kalender</Link>
          <Link className="btn" href="/trainer-dashboard/calendar#new-appointment"><Plus size={17} /> Ny avtale</Link>
        </div>
      </section>

      {!isStripeConfigured() ? <div className="trainer-alert-strip"><CircleAlert size={17} /><span>Betalingstjenesten er midlertidig utilgjengelig. Kontakt Hundetimer dersom problemet vedvarer.</span></div> : null}

      <section className="trainer-kpi-grid">
        <article className="trainer-kpi-card">
          <div className="trainer-kpi-icon"><CalendarDays size={19} /></div>
          <div><span>I dag</span><strong>{todayBookings.length}</strong><small>{todayBookings.length === 1 ? 'avtale' : 'avtaler'}</small></div>
        </article>
        <article className="trainer-kpi-card">
          <div className="trainer-kpi-icon attention"><Clock3 size={19} /></div>
          <div><span>Krever handling</span><strong>{taskCount}</strong><small>{pending.length} nye forespørsler</small></div>
        </article>
        <article className="trainer-kpi-card">
          <div className="trainer-kpi-icon money"><WalletCards size={19} /></div>
          <div><span>Til utbetaling</span><strong>{money(balance)}</strong><small>{nextPayout ? `Neste ${dateOnly(nextPayout)}` : 'Ingen planlagt utbetaling'}</small></div>
        </article>
        <article className="trainer-kpi-card">
          <div className="trainer-kpi-icon rating"><Star size={19} /></div>
          <div><span>Vurdering</span><strong>{ratingAverage ? ratingAverage.toFixed(1) : '–'}</strong><small>{reviewCount ? `${reviewCount} vurderinger` : 'Ingen vurderinger ennå'}</small></div>
        </article>
      </section>

      <div className="trainer-overview-grid">
        <section className="trainer-dashboard-panel trainer-agenda-panel">
          <div className="trainer-panel-head">
            <div><span className="eyebrow">{todayBookings.length ? 'I dag' : 'Kommende'}</span><h2>{todayBookings.length ? 'Dagens plan' : 'Neste avtaler'}</h2></div>
            <Link className="trainer-panel-link" href="/trainer-dashboard/calendar">Full kalender <ArrowRight size={15} /></Link>
          </div>
          {agenda.length ? <div className="trainer-agenda-list">{agenda.map((booking) => (
            <article className="trainer-agenda-item" key={booking.id}>
              <div className="trainer-agenda-time"><strong>{timeOnly(booking.startsAt)}</strong><span>{todayBookings.length ? 'i dag' : new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' }).format(new Date(booking.startsAt))}</span></div>
              <div className="trainer-agenda-copy"><strong>{booking.title}</strong><span>{booking.subtitle}</span></div>
              <Link className="trainer-icon-link" href={booking.href} aria-label={`Åpne ${booking.title}`}><ArrowRight size={17} /></Link>
            </article>
          ))}</div> : <div className="trainer-panel-empty"><CalendarDays size={22} /><strong>Ingen avtaler i kalenderen</strong><span>Legg inn en ekstern avtale eller åpne tilgjengelighet for nye bestillinger.</span></div>}
        </section>

        <section className="trainer-dashboard-panel trainer-actions-panel">
          <div className="trainer-panel-head"><div><span className="eyebrow">Hurtighandlinger</span><h2>Opprett nytt</h2></div></div>
          <div className="trainer-quick-grid">
            <Link href="/trainer-dashboard/calendar#new-appointment"><Plus size={18} /><span><strong>Ny avtale</strong><small>Telefon, Facebook eller direkte</small></span></Link>
            <Link href="/trainer-dashboard/groups"><GraduationCap size={18} /><span><strong>Nytt kurs</strong><small>Gruppekurs eller arrangement</small></span></Link>
            <Link href="/trainer-dashboard/online-courses"><MonitorPlay size={18} /><span><strong>Nytt nettkurs</strong><small>Bygg og publiser på nett</small></span></Link>
            <Link href="/trainer-dashboard/promotions"><Tag size={18} /><span><strong>Rabattkode</strong><small>Lag en kampanje</small></span></Link>
          </div>
        </section>

        <section className="trainer-dashboard-panel trainer-attention-panel">
          <div className="trainer-panel-head">
            <div><span className="eyebrow">Oppgaver</span><h2>Krever oppmerksomhet</h2></div>
            {taskCount ? <span className="trainer-count-pill">{taskCount}</span> : <CheckCircle2 className="trainer-all-good" size={22} />}
          </div>

          <div className="trainer-task-list">
            {trainer.verification_status !== 'approved' ? <Link className="trainer-task-row" href="/trainer-dashboard/verification"><CircleAlert size={18} /><span><strong>Fullfør trenerverifisering</strong><small>Profilen blir offentlig når verifiseringen er godkjent.</small></span><ArrowRight size={16} /></Link> : null}
            {!stripePayoutReady(payoutProfile) ? <Link className="trainer-task-row" href="/trainer-dashboard/verification"><CircleAlert size={18} /><span><strong>Fullfør Stripe-oppsettet</strong><small>Kontroller status for utbetaling hos Stripe.</small></span><ArrowRight size={16} /></Link> : null}
            {!activeServices ? <Link className="trainer-task-row" href="/trainer-dashboard/services"><CircleAlert size={18} /><span><strong>Opprett din første tjeneste</strong><small>Du har ingen aktive privattimer akkurat nå.</small></span><ArrowRight size={16} /></Link> : null}

            {pending.map((booking) => {
              const alternativeSlots = (slots || []).filter((slot) => slot.service_id === booking.service_id && new Date(slot.starts_at) > now).slice(0, 8);
              return <article className="trainer-booking-task" key={booking.id}>
                <div className="trainer-booking-task-copy"><span className="trainer-task-dot" /><div><strong>{booking.dog_name} · {serviceMap.get(booking.service_id) || 'Privattime'}</strong><small>{customerMap.get(booking.customer_id) || 'Kunde'} · {dateTime(booking.requested_starts_at)}</small></div></div>
                <div className="trainer-booking-task-actions">
                  <form action={confirmBookingAction}><input type="hidden" name="bookingId" value={booking.id} /><button className="btn compact" type="submit">Bekreft</button></form>
                  <form action={declineBookingAction}><input type="hidden" name="bookingId" value={booking.id} /><button className="btn secondary compact" type="submit">Avslå</button></form>
                  {alternativeSlots.length ? <details className="trainer-reschedule-details"><summary>Ny tid</summary><form action={offerRescheduleAction}><input type="hidden" name="bookingId" value={booking.id} /><select aria-label="Alternativt tidspunkt" name="slotId" required defaultValue=""><option value="">Velg tid</option>{alternativeSlots.map((slot) => <option key={slot.id} value={slot.id}>{dateTime(slot.starts_at)}</option>)}</select><input aria-label="Melding om nytt tidspunkt" name="note" placeholder="Valgfri melding" /><button className="btn compact" type="submit">Send</button></form></details> : null}
                </div>
              </article>;
            })}

            {readyToComplete.map((booking) => <article className="trainer-booking-task" key={booking.id}><div className="trainer-booking-task-copy"><CheckCircle2 size={18} /><div><strong>Marker {booking.dog_name} som fullført</strong><small>{serviceMap.get(booking.service_id) || 'Privattime'} · {dateTime(booking.requested_starts_at)}</small></div></div><form action={markBookingCompletedAction}><input type="hidden" name="bookingId" value={booking.id} /><button className="btn secondary compact" type="submit">Fullført</button></form></article>)}

            {waitingForCustomer.length ? <div className="trainer-task-note">{waitingForCustomer.length} bestilling{waitingForCustomer.length === 1 ? '' : 'er'} venter på at kunden svarer på nytt tidspunkt.</div> : null}
            {!taskCount && activeServices ? <div className="trainer-panel-empty compact"><CheckCircle2 size={23} /><strong>Alt er ajour</strong><span>Ingen oppgaver krever handling akkurat nå.</span></div> : null}
          </div>
        </section>

        <section className="trainer-dashboard-panel trainer-review-panel">
          <div className="trainer-panel-head"><div><span className="eyebrow">Tilbakemeldinger</span><h2>Siste vurderinger</h2></div><Link className="trainer-panel-link" href="/trainer-dashboard/reviews">Se alle <ArrowRight size={15} /></Link></div>
          {(reviews || []).length ? <div className="trainer-review-list">{(reviews || []).slice(0, 3).map((review) => <article key={review.id}><div className="trainer-review-stars">{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</div><p>{review.comment || 'Vurdering uten kommentar.'}</p><small>{customerMap.get(review.customer_id) || 'Kunde'} · {serviceMap.get(review.service_id) || 'Tjeneste'}</small></article>)}</div> : <div className="trainer-panel-empty compact"><Star size={22} /><strong>Ingen vurderinger ennå</strong><span>De vises her etter fullførte bestillinger.</span></div>}
        </section>
      </div>
    </main>
  );
}

