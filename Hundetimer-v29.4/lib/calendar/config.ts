export type CalendarProvider = 'google' | 'microsoft';

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET && process.env.CALENDAR_TOKEN_ENCRYPTION_KEY);
}

export function microsoftConfigured() {
  return Boolean(process.env.MICROSOFT_CALENDAR_CLIENT_ID && process.env.MICROSOFT_CALENDAR_CLIENT_SECRET && process.env.CALENDAR_TOKEN_ENCRYPTION_KEY);
}

export function calendarEncryptionConfigured() {
  return Boolean(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY);
}
