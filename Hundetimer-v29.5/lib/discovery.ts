export function normalise(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function containsSearch(values: unknown[], query: string) {
  const needle = normalise(query);
  if (!needle) return true;
  return values.some((value) => normalise(Array.isArray(value) ? value.join(' ') : value).includes(needle));
}

export function numberParam(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function withinDays(iso: string | null | undefined, days: number) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  const now = Date.now();
  return time >= now && time <= now + days * 86400000;
}

export function formatDistance(km: number | null) {
  if (km == null) return null;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km unna`;
  return `${Math.round(km)} km unna`;
}
