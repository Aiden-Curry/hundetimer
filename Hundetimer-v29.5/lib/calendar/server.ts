import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken, encryptToken } from './crypto';
import type { CalendarProvider } from './config';
import {
  createGoogleEvent,
  deleteGoogleEvent,
  googleBusy,
  refreshGoogleAccessToken,
  updateGoogleEvent,
} from './google';
import {
  createMicrosoftEvent,
  deleteMicrosoftEvent,
  microsoftBusy,
  refreshMicrosoftAccessToken,
  updateMicrosoftEvent,
} from './microsoft';

type Connection = {
  trainer_id: string;
  provider: CalendarProvider;
  account_email: string | null;
  calendar_id: string;
  sync_busy: boolean;
  sync_bookings: boolean;
};

async function getConnection(trainerId: string) {
  const admin = createAdminClient();
  const [{ data: connection }, { data: secret }] = await Promise.all([
    admin.from('calendar_connections').select('trainer_id, provider, account_email, calendar_id, sync_busy, sync_bookings').eq('trainer_id', trainerId).maybeSingle(),
    admin.from('calendar_connection_secrets').select('encrypted_refresh_token').eq('trainer_id', trainerId).maybeSingle(),
  ]);
  if (!connection || !secret?.encrypted_refresh_token) return null;
  return { connection: connection as Connection, refreshToken: decryptToken(secret.encrypted_refresh_token) };
}

async function accessTokenFor(trainerId: string) {
  const record = await getConnection(trainerId);
  if (!record) return null;
  if (record.connection.provider === 'google') {
    return { ...record, accessToken: await refreshGoogleAccessToken(record.refreshToken) };
  }
  const refreshed = await refreshMicrosoftAccessToken(record.refreshToken);
  if (refreshed.refresh_token && refreshed.refresh_token !== record.refreshToken) {
    await createAdminClient().from('calendar_connection_secrets').update({ encrypted_refresh_token: encryptToken(refreshed.refresh_token), updated_at: new Date().toISOString() }).eq('trainer_id', trainerId);
  }
  return { ...record, accessToken: refreshed.access_token };
}

export async function saveCalendarConnection(input: { trainerId: string; provider: CalendarProvider; refreshToken: string; accountEmail?: string | null }) {
  const admin = createAdminClient();
  await admin.from('calendar_connections').upsert({
    trainer_id: input.trainerId,
    provider: input.provider,
    account_email: input.accountEmail || null,
    calendar_id: 'primary',
    sync_busy: true,
    sync_bookings: true,
    connected_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  await admin.from('calendar_connection_secrets').upsert({
    trainer_id: input.trainerId,
    encrypted_refresh_token: encryptToken(input.refreshToken),
    token_version: 1,
    updated_at: new Date().toISOString(),
  });
}

export async function disconnectCalendar(trainerId: string) {
  const admin = createAdminClient();
  const auth = await accessTokenFor(trainerId).catch(() => null);
  const [{ data: events }, { data: externalEvents }] = await Promise.all([
    admin.from('booking_calendar_events').select('external_event_id, provider').eq('trainer_id', trainerId),
    admin.from('external_appointment_calendar_events').select('external_event_id, provider').eq('trainer_id', trainerId),
  ]);
  if (auth) {
    for (const event of [...(events || []), ...(externalEvents || [])]) {
      if (event.provider !== auth.connection.provider) continue;
      try {
        if (event.provider === 'google') await deleteGoogleEvent(auth.accessToken, event.external_event_id);
        else await deleteMicrosoftEvent(auth.accessToken, event.external_event_id);
      } catch {
        // Disconnect should still complete if an external event was already removed.
      }
    }
  }
  await admin.from('booking_calendar_events').delete().eq('trainer_id', trainerId);
  await admin.from('external_appointment_calendar_events').delete().eq('trainer_id', trainerId);
  await admin.from('calendar_busy_blocks').delete().eq('trainer_id', trainerId);
  await admin.from('calendar_connections').delete().eq('trainer_id', trainerId);
}

export async function syncTrainerBusyTime(trainerId: string, days = 60) {
  const auth = await accessTokenFor(trainerId);
  if (!auth || !auth.connection.sync_busy) return { blocks: 0 };
  const admin = createAdminClient();
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + Math.max(1, Math.min(days, 120)) * 86400000).toISOString();
  try {
    const busy = auth.connection.provider === 'google'
      ? await googleBusy(auth.accessToken, timeMin, timeMax)
      : await microsoftBusy(auth.accessToken, timeMin, timeMax);

    await admin.from('calendar_busy_blocks').delete().eq('trainer_id', trainerId).gte('ends_at', timeMin);
    if (busy.length) {
      await admin.from('calendar_busy_blocks').insert(busy.map((row) => ({
        trainer_id: trainerId,
        provider: auth.connection.provider,
        starts_at: row.start,
        ends_at: row.end,
        synced_at: new Date().toISOString(),
      })));
    }

    // Remove currently open slots that now conflict. The normal availability editor regenerates around these blocks.
    for (const row of busy) {
      await admin.from('availability_slots').delete().eq('trainer_id', trainerId).eq('status', 'open').lt('starts_at', row.end).gt('ends_at', row.start);
    }
    await admin.from('calendar_connections').update({ last_busy_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('trainer_id', trainerId);
    return { blocks: busy.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kalendersynkronisering feilet.';
    await admin.from('calendar_connections').update({ last_error: message, updated_at: new Date().toISOString() }).eq('trainer_id', trainerId);
    throw error;
  }
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

async function bookingEventPayload(bookingId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin.from('bookings').select('id, trainer_id, customer_id, service_id, dog_name, requested_starts_at, status').eq('id', bookingId).maybeSingle();
  if (!booking) return null;
  const [{ data: service }, { data: customer }] = await Promise.all([
    admin.from('services').select('title, duration_minutes').eq('id', booking.service_id).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', booking.customer_id).maybeSingle(),
  ]);
  if (!service) return null;
  return {
    trainerId: booking.trainer_id,
    startsAt: booking.requested_starts_at,
    endsAt: addMinutes(booking.requested_starts_at, service.duration_minutes),
    summary: `${service.title} · ${booking.dog_name || 'Hund'}`,
    description: `Kunde: ${customer?.display_name || 'Kunde'}\nHund: ${booking.dog_name || 'Hund'}\nBooking: ${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/booking/${booking.id}`,
  };
}

export async function syncBookingToCalendar(bookingId: string) {
  const payload = await bookingEventPayload(bookingId);
  if (!payload) return;
  const auth = await accessTokenFor(payload.trainerId);
  if (!auth || !auth.connection.sync_bookings) return;
  const admin = createAdminClient();
  const { data: existing } = await admin.from('booking_calendar_events').select('provider, external_event_id, external_calendar_id').eq('booking_id', bookingId).maybeSingle();
  try {
    let eventId = existing?.provider === auth.connection.provider ? existing.external_event_id : null;
    if (eventId) {
      const updated = auth.connection.provider === 'google'
        ? await updateGoogleEvent(auth.accessToken, eventId, payload)
        : await updateMicrosoftEvent(auth.accessToken, eventId, payload);
      if (!updated) eventId = null;
    }
    if (!eventId) {
      eventId = auth.connection.provider === 'google'
        ? await createGoogleEvent(auth.accessToken, { ...payload, bookingId })
        : await createMicrosoftEvent(auth.accessToken, { ...payload, bookingId });
    }
    await admin.from('booking_calendar_events').upsert({
      booking_id: bookingId,
      trainer_id: payload.trainerId,
      provider: auth.connection.provider,
      external_event_id: eventId,
      external_calendar_id: 'primary',
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kalenderhendelsen kunne ikke synkroniseres.';
    await admin.from('calendar_connections').update({ last_error: message, updated_at: new Date().toISOString() }).eq('trainer_id', payload.trainerId);
  }
}

export async function deleteBookingCalendarEvent(bookingId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin.from('booking_calendar_events').select('trainer_id, provider, external_event_id').eq('booking_id', bookingId).maybeSingle();
  if (!row) return;
  const auth = await accessTokenFor(row.trainer_id);
  if (auth && auth.connection.provider === row.provider) {
    try {
      if (row.provider === 'google') await deleteGoogleEvent(auth.accessToken, row.external_event_id);
      else await deleteMicrosoftEvent(auth.accessToken, row.external_event_id);
    } catch {
      // Local booking cancellation must still succeed even if the external provider is unavailable.
    }
  }
  await admin.from('booking_calendar_events').delete().eq('booking_id', bookingId);
}

export async function syncFutureConfirmedBookings(trainerId: string) {
  const admin = createAdminClient();
  const { data: bookings } = await admin.from('bookings').select('id').eq('trainer_id', trainerId).eq('status', 'confirmed').gte('requested_starts_at', new Date().toISOString()).order('requested_starts_at').limit(200);
  for (const booking of bookings || []) await syncBookingToCalendar(booking.id);
  return (bookings || []).length;
}


async function externalAppointmentPayload(appointmentId: string) {
  const admin = createAdminClient();
  const { data: appointment } = await admin.from('external_appointments')
    .select('id, trainer_id, client_id, dog_id, service_id, title, starts_at, ends_at, source, payment_status, price_nok, notes, sync_to_calendar')
    .eq('id', appointmentId).maybeSingle();
  if (!appointment || appointment.sync_to_calendar === false) return null;
  const [{ data: client }, { data: dog }, { data: service }] = await Promise.all([
    appointment.client_id ? admin.from('trainer_clients').select('name,email,phone').eq('id', appointment.client_id).maybeSingle() : Promise.resolve({ data: null }),
    appointment.dog_id ? admin.from('trainer_client_dogs').select('name,breed').eq('id', appointment.dog_id).maybeSingle() : Promise.resolve({ data: null }),
    appointment.service_id ? admin.from('services').select('title').eq('id', appointment.service_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sourceLabel: Record<string,string> = { phone:'Telefon', facebook:'Facebook', email:'E-post', direct:'Direkte', other:'Annet' };
  return {
    trainerId: appointment.trainer_id,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    summary: `${appointment.title}${dog?.name ? ` · ${dog.name}` : ''}`,
    description: [
      'Ekstern avtale opprettet i Hundetimer',
      client?.name ? `Kunde: ${client.name}` : null,
      dog?.name ? `Hund: ${dog.name}${dog.breed ? ` (${dog.breed})` : ''}` : null,
      service?.title ? `Tjeneste: ${service.title}` : null,
      `Kilde: ${sourceLabel[appointment.source] || appointment.source}`,
      appointment.price_nok ? `Pris: ${appointment.price_nok} kr` : null,
      appointment.notes ? `Notat: ${appointment.notes}` : null,
    ].filter(Boolean).join('\n'),
  };
}

export async function syncExternalAppointmentToCalendar(appointmentId: string) {
  const payload = await externalAppointmentPayload(appointmentId);
  if (!payload) return;
  const auth = await accessTokenFor(payload.trainerId);
  if (!auth || !auth.connection.sync_bookings) return;
  const admin = createAdminClient();
  const { data: existing } = await admin.from('external_appointment_calendar_events')
    .select('provider, external_event_id, external_calendar_id').eq('appointment_id', appointmentId).maybeSingle();
  try {
    let eventId = existing?.provider === auth.connection.provider ? existing.external_event_id : null;
    if (eventId) {
      const updated = auth.connection.provider === 'google'
        ? await updateGoogleEvent(auth.accessToken, eventId, payload)
        : await updateMicrosoftEvent(auth.accessToken, eventId, payload);
      if (!updated) eventId = null;
    }
    if (!eventId) {
      eventId = auth.connection.provider === 'google'
        ? await createGoogleEvent(auth.accessToken, { ...payload, platformReference: `external:${appointmentId}` })
        : await createMicrosoftEvent(auth.accessToken, { ...payload, platformReference: `external:${appointmentId}` });
    }
    await admin.from('external_appointment_calendar_events').upsert({
      appointment_id: appointmentId,
      trainer_id: payload.trainerId,
      provider: auth.connection.provider,
      external_event_id: eventId,
      external_calendar_id: 'primary',
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ekstern avtale kunne ikke synkroniseres.';
    await admin.from('calendar_connections').update({ last_error: message, updated_at: new Date().toISOString() }).eq('trainer_id', payload.trainerId);
  }
}

export async function deleteExternalAppointmentCalendarEvent(appointmentId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin.from('external_appointment_calendar_events')
    .select('trainer_id, provider, external_event_id').eq('appointment_id', appointmentId).maybeSingle();
  if (!row) return;
  const auth = await accessTokenFor(row.trainer_id);
  if (auth && auth.connection.provider === row.provider) {
    try {
      if (row.provider === 'google') await deleteGoogleEvent(auth.accessToken, row.external_event_id);
      else await deleteMicrosoftEvent(auth.accessToken, row.external_event_id);
    } catch {
      // Local planner edits must still succeed if the external provider is unavailable.
    }
  }
  await admin.from('external_appointment_calendar_events').delete().eq('appointment_id', appointmentId);
}

export async function syncFutureExternalAppointments(trainerId: string) {
  const admin = createAdminClient();
  const { data: appointments } = await admin.from('external_appointments').select('id').eq('trainer_id', trainerId).eq('sync_to_calendar', true)
    .gte('ends_at', new Date().toISOString()).order('starts_at').limit(300);
  for (const appointment of appointments || []) await syncExternalAppointmentToCalendar(appointment.id);
  return (appointments || []).length;
}
