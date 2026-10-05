import { siteUrl } from './config';

const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';

function credentials() {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Microsoft Calendar OAuth er ikke konfigurert.');
  return { clientId, clientSecret };
}

export function microsoftAuthorizationUrl(state: string) {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: `${siteUrl()}/api/calendar/microsoft/callback`,
    response_mode: 'query',
    scope: 'openid profile email offline_access User.Read Calendars.ReadWrite',
    state,
    prompt: 'select_account',
  });
  return `${AUTH_BASE}/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code: string) {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: `${siteUrl()}/api/calendar/microsoft/callback`,
    grant_type: 'authorization_code',
    scope: 'openid profile email offline_access User.Read Calendars.ReadWrite',
  });
  const response = await fetch(`${AUTH_BASE}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  if (!response.ok) throw new Error(`Microsoft OAuth feilet (${response.status}).`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token', scope: 'openid profile email offline_access User.Read Calendars.ReadWrite' });
  const response = await fetch(`${AUTH_BASE}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  if (!response.ok) throw new Error(`Microsoft-token kunne ikke fornyes (${response.status}).`);
  const json = await response.json() as { access_token: string; refresh_token?: string };
  return json;
}

export async function microsoftAccountEmail(accessToken: string) {
  const response = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (!response.ok) return null;
  const json = await response.json() as { mail?: string; userPrincipalName?: string };
  return json.mail || json.userPrincipalName || null;
}

export async function microsoftBusy(accessToken: string, timeMin: string, timeMax: string) {
  let url = `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$select=id,start,end,showAs,isCancelled&$top=999`;
  const rows: { start: string; end: string }[] = [];
  for (let page = 0; url && page < 5; page += 1) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Outlook-kalenderen kunne ikke leses (${response.status}).`);
    const json = await response.json() as { value?: { start?: { dateTime?: string }; end?: { dateTime?: string }; showAs?: string; isCancelled?: boolean }[]; '@odata.nextLink'?: string };
    for (const event of json.value || []) {
      if (event.isCancelled || event.showAs === 'free' || !event.start?.dateTime || !event.end?.dateTime) continue;
      const startRaw = event.start.dateTime; const endRaw = event.end.dateTime;
      rows.push({ start: new Date(/[zZ]|[+-]\d\d:\d\d$/.test(startRaw) ? startRaw : `${startRaw}Z`).toISOString(), end: new Date(/[zZ]|[+-]\d\d:\d\d$/.test(endRaw) ? endRaw : `${endRaw}Z`).toISOString() });
    }
    url = json['@odata.nextLink'] || '';
  }
  return rows;
}

function graphDate(iso: string) {
  return new Date(iso).toISOString().replace(/Z$/, '');
}

export async function createMicrosoftEvent(accessToken: string, input: { summary: string; description: string; startsAt: string; endsAt: string; bookingId?: string; platformReference?: string }) {
  const response = await fetch(`${GRAPH}/me/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: input.summary,
      body: { contentType: 'text', content: `${input.description}\n\nReferanse: ${input.platformReference || input.bookingId || ''}` },
      start: { dateTime: graphDate(input.startsAt), timeZone: 'UTC' },
      end: { dateTime: graphDate(input.endsAt), timeZone: 'UTC' },
      showAs: 'busy',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Outlook-hendelsen kunne ikke opprettes (${response.status}).`);
  const json = await response.json() as { id?: string };
  if (!json.id) throw new Error('Microsoft returnerte ingen hendelses-ID.');
  return json.id;
}

export async function updateMicrosoftEvent(accessToken: string, eventId: string, input: { summary: string; description: string; startsAt: string; endsAt: string }) {
  const response = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ subject: input.summary, body: { contentType: 'text', content: input.description }, start: { dateTime: graphDate(input.startsAt), timeZone: 'UTC' }, end: { dateTime: graphDate(input.endsAt), timeZone: 'UTC' } }),
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 404) throw new Error(`Outlook-hendelsen kunne ikke oppdateres (${response.status}).`);
  return response.status !== 404;
}

export async function deleteMicrosoftEvent(accessToken: string, eventId: string) {
  const response = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (!response.ok && response.status !== 404) throw new Error(`Outlook-hendelsen kunne ikke slettes (${response.status}).`);
}
