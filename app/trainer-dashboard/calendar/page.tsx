import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { googleConfigured } from '@/lib/calendar/config';
import { TrainerCalendarBoard } from '@/components/trainer-calendar-board';
import {
  createExternalAppointmentAction,
  deleteExternalAppointmentAction,
  disconnectCalendarAction,
  saveCalendarSettingsAction,
  syncCalendarAction,
  updateExternalAppointmentAction,
} from './actions';

function dateTime(value?: string | null) {
  if (!value) return 'Aldri';
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' }).format(new Date(value));
}
function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }
function localInput(value: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Oslo', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
function addMinutes(value: string, minutes: number) { return new Date(new Date(value).getTime() + minutes * 60000).toISOString(); }
const sourceLabel: Record<string,string> = { phone:'Telefon', facebook:'Facebook', email:'E-post', direct:'Direkte', other:'Annet' };
const paymentLabel: Record<string,string> = { unpaid:'Ikke betalt', paid_external:'Betalt eksternt', free:'Gratis' };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/calendar');

  const rangeStart = new Date(Date.now() - 62 * 86400000).toISOString();
  const rangeEnd = new Date(Date.now() + 370 * 86400000).toISOString();
  const [
    { data: profile },
    { data: connection },
    busyResult,
    eventResult,
    { data: services },
    { data: clients },
    { data: clientDogs },
    { data: bookings },
    { data: externalAppointments },
    { data: offerings },
    { data: groupSessions },
    { data: busyBlocks },
    { data: manualBlocks },
  ] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('calendar_connections').select('provider, account_email, sync_busy, sync_bookings, connected_at, last_busy_sync_at, last_error').eq('trainer_id', user.id).maybeSingle(),
    supabase.from('calendar_busy_blocks').select('id', { count: 'exact', head: true }).eq('trainer_id', user.id).gte('ends_at', new Date().toISOString()),
    supabase.from('booking_calendar_events').select('booking_id', { count: 'exact', head: true }).eq('trainer_id', user.id),
    supabase.from('services').select('id,title,duration_minutes,price_nok').eq('trainer_id', user.id).order('title'),
    supabase.from('trainer_clients').select('*').eq('trainer_id', user.id).order('name'),
    supabase.from('trainer_client_dogs').select('*').eq('trainer_id', user.id).order('name'),
    supabase.from('bookings').select('id,customer_id,service_id,dog_name,requested_starts_at,status,payment_status').eq('trainer_id', user.id).gte('requested_starts_at', rangeStart).lte('requested_starts_at', rangeEnd).order('requested_starts_at'),
    supabase.from('external_appointments').select('*').eq('trainer_id', user.id).gte('ends_at', rangeStart).lte('starts_at', rangeEnd).order('starts_at'),
    supabase.from('group_offerings').select('id,title,kind,active,completed_at').eq('trainer_id', user.id),
    supabase.from('group_sessions').select('id,offering_id,title,starts_at,ends_at').gte('ends_at', rangeStart).lte('starts_at', rangeEnd).order('starts_at'),
    supabase.from('calendar_busy_blocks').select('id,provider,starts_at,ends_at').eq('trainer_id', user.id).gte('ends_at', rangeStart).lte('starts_at', rangeEnd).order('starts_at'),
    supabase.from('availability_exceptions').select('id,service_id,starts_at,ends_at,note').eq('trainer_id', user.id).eq('kind','blocked').gte('ends_at', rangeStart).lte('starts_at', rangeEnd).order('starts_at'),
  ]);
  if (profile?.role !== 'trainer') redirect('/account');

  const serviceMap = new Map((services || []).map((service) => [service.id, service]));
  const clientMap = new Map((clients || []).map((client) => [client.id, client]));
  const dogMap = new Map((clientDogs || []).map((dog) => [dog.id, dog]));
  const offeringMap = new Map((offerings || []).map((offering) => [offering.id, offering]));
  const customerIds = [...new Set((bookings || []).map((booking) => booking.customer_id).filter(Boolean))];
  const { data: customerProfiles } = customerIds.length ? await supabase.from('profiles').select('id,display_name').in('id', customerIds) : { data: [] as { id:string; display_name:string }[] };
  const customerMap = new Map((customerProfiles || []).map((customer) => [customer.id, customer.display_name]));

  const plannerEvents = [
    ...(bookings || []).filter((booking) => !['cancelled_by_customer','declined_by_trainer','refunded'].includes(booking.status)).map((booking) => {
      const service = serviceMap.get(booking.service_id);
      return {
        id: booking.id,
        type: 'booking' as const,
        title: `${service?.title || 'Privattime'} · ${booking.dog_name || 'Hund'}`,
        subtitle: `${customerMap.get(booking.customer_id) || 'Kunde'} · ${booking.status === 'completed' ? 'Fullført' : booking.status === 'confirmed' ? 'Bekreftet' : 'Venter'}`,
        startsAt: booking.requested_starts_at,
        endsAt: addMinutes(booking.requested_starts_at, service?.duration_minutes || 60),
        href: `/trainer-dashboard/journal/booking/${booking.id}`,
      };
    }),
    ...(externalAppointments || []).map((appointment) => ({
      id: appointment.id,
      type: 'external' as const,
      title: appointment.title,
      subtitle: [appointment.client_id ? clientMap.get(appointment.client_id)?.name : null, appointment.dog_id ? dogMap.get(appointment.dog_id)?.name : null, sourceLabel[appointment.source]].filter(Boolean).join(' · '),
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      href: `/trainer-dashboard/journal/external/${appointment.id}`,
    })),
    ...(groupSessions || []).filter((session) => offeringMap.has(session.offering_id)).map((session) => {
      const offering = offeringMap.get(session.offering_id)!;
      return { id: session.id, type:'group' as const, title: offering.title, subtitle: session.title || (offering.kind === 'course' ? 'Kurs' : 'Arrangement'), startsAt:session.starts_at, endsAt:session.ends_at, href:'/trainer-dashboard/groups' };
    }),
    ...(busyBlocks || []).map((block) => ({ id:block.id,type:'busy' as const,title:'Opptatt i Google Kalender',subtitle:'Ekstern kalender',startsAt:block.starts_at,endsAt:block.ends_at,href:null })),
    ...(manualBlocks || []).map((block) => ({ id:block.id,type:'block' as const,title:block.note || 'Blokkert tid',subtitle:block.service_id ? serviceMap.get(block.service_id)?.title || 'Tjeneste' : 'Alle tjenester',startsAt:block.starts_at,endsAt:block.ends_at,href:'/trainer-dashboard/availability' })),
  ];

  const upcomingExternal = (externalAppointments || []).filter((appointment) => new Date(appointment.ends_at) > new Date()).slice(0,25);

  return <main className="dashboard trainer-planner-page">
    <Link className="back-link" href="/trainer-dashboard">← Til trenerdashbord</Link>
    <section className="dashboard-heading"><div><span className="eyebrow">Planlegger</span><h1>Kalender og bookingstyring</h1><p className="muted">Markedsplassbestillinger, eksterne kunder, kurs, blokker og Google Kalender samlet på ett sted.</p></div><div className="dashboard-heading-actions"><Link className="btn secondary" href="/trainer-dashboard/clients">Kunderegister</Link><a className="btn" href="#new-appointment">+ Ny avtale</a></div></section>
    {message ? <p className="form-success dashboard-flash">{message}</p> : null}
    {error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}

    <div id="planner"><TrainerCalendarBoard events={plannerEvents} /></div>

    <section id="new-appointment" className="editor-card planner-appointment-form-card">
      <div className="section-title"><div><span className="eyebrow">Ekstern bestilling</span><h2>Legg inn privat avtale</h2><p className="muted">Bruk dette når kunden kommer fra telefon, Facebook, e-post eller direkte. Avtalen blokkerer automatisk markedsplassen.</p></div><Link href="/trainer-dashboard/clients" className="text-link">+ Legg til kunde/hund</Link></div>
      <form action={createExternalAppointmentAction} className="form-grid editor-form-grid planner-appointment-form">
        <label>Kunde<select name="clientId" defaultValue=""><option value="">Ingen lagret kunde</option>{(clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label>Hund<select name="dogId" defaultValue=""><option value="">Ingen lagret hund</option>{(clientDogs || []).map((dog) => <option key={dog.id} value={dog.id}>{clientMap.get(dog.client_id)?.name || 'Kunde'} · {dog.name}</option>)}</select></label>
        <label>Tjeneste<select name="serviceId" defaultValue=""><option value="">Annen avtale</option>{(services || []).map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label>
        <label>Tittel<input name="title" placeholder="For eksempel Privattime" /></label>
        <label>Start<input name="startsAt" type="datetime-local" required /></label>
        <label>Slutt<input name="endsAt" type="datetime-local" required /></label>
        <label>Bestillingskilde<select name="source" defaultValue="other"><option value="phone">Telefon</option><option value="facebook">Facebook</option><option value="email">E-post</option><option value="direct">Direkte</option><option value="other">Annet</option></select></label>
        <label>Betaling<select name="paymentStatus" defaultValue="unpaid"><option value="unpaid">Ikke betalt</option><option value="paid_external">Betalt eksternt</option><option value="free">Gratis</option></select></label>
        <label>Pris<input name="priceNok" type="number" min="0" defaultValue="0" /></label>
        <label className="checkbox-label"><input name="syncCalendar" type="checkbox" defaultChecked={Boolean(connection?.sync_bookings)} /> Legg også i Google Kalender</label>
        <label className="full">Internt notat<textarea name="notes" rows={3} placeholder="Valgfritt" /></label>
        <div className="full"><button className="btn" type="submit">Opprett avtale</button></div>
      </form>
    </section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Eksterne avtaler</span><h2>Kommende manuelt registrerte timer</h2></div></div>{upcomingExternal.length ? <div className="planner-external-list">{upcomingExternal.map((appointment) => <article className="planner-external-card" key={appointment.id}><div><strong>{appointment.title}</strong><span>{dateTime(appointment.starts_at)} – {new Intl.DateTimeFormat('nb-NO',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo'}).format(new Date(appointment.ends_at))}</span><small>{[appointment.client_id ? clientMap.get(appointment.client_id)?.name : null, appointment.dog_id ? dogMap.get(appointment.dog_id)?.name : null, sourceLabel[appointment.source], paymentLabel[appointment.payment_status], appointment.price_nok ? money(appointment.price_nok) : null].filter(Boolean).join(' · ')}</small></div><div className="planner-external-actions"><Link className="text-link" href={`/trainer-dashboard/journal/external/${appointment.id}`}>Journal</Link><details><summary>Rediger</summary><form action={updateExternalAppointmentAction} className="form-grid editor-form-grid compact-form planner-edit-form"><input type="hidden" name="id" value={appointment.id} /><label>Kunde<select name="clientId" defaultValue={appointment.client_id || ''}><option value="">Ingen lagret kunde</option>{(clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Hund<select name="dogId" defaultValue={appointment.dog_id || ''}><option value="">Ingen lagret hund</option>{(clientDogs || []).map((dog) => <option key={dog.id} value={dog.id}>{clientMap.get(dog.client_id)?.name || 'Kunde'} · {dog.name}</option>)}</select></label><label>Tjeneste<select name="serviceId" defaultValue={appointment.service_id || ''}><option value="">Annen avtale</option>{(services || []).map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label><label>Tittel<input name="title" defaultValue={appointment.title} /></label><label>Start<input name="startsAt" type="datetime-local" defaultValue={localInput(appointment.starts_at)} required /></label><label>Slutt<input name="endsAt" type="datetime-local" defaultValue={localInput(appointment.ends_at)} required /></label><label>Kilde<select name="source" defaultValue={appointment.source}><option value="phone">Telefon</option><option value="facebook">Facebook</option><option value="email">E-post</option><option value="direct">Direkte</option><option value="other">Annet</option></select></label><label>Betaling<select name="paymentStatus" defaultValue={appointment.payment_status}><option value="unpaid">Ikke betalt</option><option value="paid_external">Betalt eksternt</option><option value="free">Gratis</option></select></label><label>Pris<input name="priceNok" type="number" min="0" defaultValue={appointment.price_nok} /></label><label className="checkbox-label"><input name="syncCalendar" type="checkbox" defaultChecked={appointment.sync_to_calendar !== false} /> Synkroniser til Google</label><label className="full">Notat<textarea name="notes" rows={2} defaultValue={appointment.notes || ''} /></label><div className="full"><button className="btn compact" type="submit">Lagre</button></div></form></details><form action={deleteExternalAppointmentAction}><input type="hidden" name="id" value={appointment.id} /><button className="text-button danger-text" type="submit">Fjern</button></form></div></article>)}</div> : <p className="muted">Ingen kommende eksterne avtaler.</p>}</section>

    <section className="dashboard-section calendar-settings-shell"><div className="section-title"><div><span className="eyebrow">Google Kalender</span><h2>Ekstern kalendersynkronisering</h2></div></div>{!connection ? <div className="calendar-provider-grid"><article className="card calendar-provider-card"><h3>Google Kalender</h3><p className="muted">Importer opptatt tid og legg plattformens avtaler i Google Kalender.</p>{googleConfigured() ? <a className="btn" href="/api/calendar/google/connect">Koble til Google Kalender</a> : <p className="notice">Google Kalender er ikke tilgjengelig ennå. Du kan fortsatt administrere avtalene dine her.</p>}</article></div> : <><div className="calendar-connected-card"><div><span className="eyebrow">Tilkoblet</span><h3>Google Kalender ✓</h3><p className="muted">{connection.account_email || 'Kalenderkonto'} · sist lest {dateTime(connection.last_busy_sync_at)}</p>{connection.last_error ? <p className="form-error form-error-block">Siste feil: {connection.last_error}</p> : null}</div><form action={disconnectCalendarAction}><button className="btn secondary" type="submit">Koble fra</button></form></div><div className="stats-grid calendar-stats"><div className="stat-card"><span className="muted small">Importerte opptatt-perioder</span><strong>{busyResult.count || 0}</strong></div><div className="stat-card"><span className="muted small">Synkroniserte markedsplasstimer</span><strong>{eventResult.count || 0}</strong></div></div><form action={saveCalendarSettingsAction} className="calendar-settings-form"><label className="checkbox-label"><input type="checkbox" name="syncBusy" defaultChecked={connection.sync_busy} /> Bruk Google-opptatt tid til å blokkere markedsplassen</label><label className="checkbox-label"><input type="checkbox" name="syncBookings" defaultChecked={connection.sync_bookings} /> Synkroniser markedsplass- og eksterne avtaler til Google</label><button className="btn secondary" type="submit">Lagre innstillinger</button></form><form action={syncCalendarAction}><button className="btn" type="submit">Synkroniser nå</button></form></>}</section>
  </main>;
}
