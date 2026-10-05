import { siteUrl } from './config';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR = 'https://www.googleapis.com/calendar/v3';

function credentials() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google Calendar OAuth er ikke konfigurert.');
  return { clientId, clientSecret };
}

export function googleAuthorizationUrl(state: string) {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${siteUrl()}/api/calendar/google/callback`,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ].join(' '),
  });
  return `${GOOGLE_AUTH}?${params}`;
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${siteUrl()}/api/calendar/google/callback`,
    grant_type: 'authorization_code',
  });
  const response = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  if (!response.ok) throw new Error(`Google OAuth feilet (${response.status}).`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const response = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  if (!response.ok) throw new Error(`Google-token kunne ikke fornyes (${response.status}).`);
  const json = await response.json() as { access_token: string };
  return json.access_token;
}

export async function googleAccountEmail(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (!response.ok) return null;
  const json = await response.json() as { email?: string };
  return json.email || null;
}

export async function googleBusy(accessToken: string, timeMin: string, timeMax: string) {
  const response = await fetch(`${GOOGLE_CALENDAR}/freeBusy`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, timeZone: 'Europe/Oslo', items: [{ id: 'primary' }] }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google Calendar kunne ikke lese opptatt tid (${response.status}).`);
  const json = await response.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  return json.calendars?.primary?.busy || [];
}

export async function createGoogleEvent(accessToken: string, input: { summary: string; description: string; startsAt: string; endsAt: string; bookingId?: string; platformReference?: string }) {
  const response = await fetch(`${GOOGLE_CALENDAR}/calendars/primary/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startsAt, timeZone: 'Europe/Oslo' },
      end: { dateTime: input.endsAt, timeZone: 'Europe/Oslo' },
      extendedProperties: { private: { dogPlatformReference: input.platformReference || input.bookingId || '' } },
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google-kalenderhendelsen kunne ikke opprettes (${response.status}).`);
  const json = await response.json() as { id?: string };
  if (!json.id) throw new Error('Google returnerte ingen hendelses-ID.');
  return json.id;
}

export async function updateGoogleEvent(accessToken: string, eventId: string, input: { summary: string; description: string; startsAt: string; endsAt: string }) {
  const response = await fetch(`${GOOGLE_CALENDAR}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ summary: input.summary, description: input.description, start: { dateTime: input.startsAt, timeZone: 'Europe/Oslo' }, end: { dateTime: input.endsAt, timeZone: 'Europe/Oslo' } }),
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 404) throw new Error(`Google-kalenderhendelsen kunne ikke oppdateres (${response.status}).`);
  return response.status !== 404;
}

export async function deleteGoogleEvent(accessToken: string, eventId: string) {
  const response = await fetch(`${GOOGLE_CALENDAR}/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google-kalenderhendelsen kunne ikke slettes (${response.status}).`);
}
