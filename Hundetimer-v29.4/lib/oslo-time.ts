export function osloLocalInputToIso(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Ugyldig dato eller tidspunkt.');
  const [, y, m, d, hh, mm] = match;
  const utcGuess = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
  const offsetPart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo', timeZoneName: 'shortOffset', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(utcGuess).find((part) => part.type === 'timeZoneName')?.value || 'GMT+0';
  const offsetMatch = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const sign = offsetMatch?.[1] === '-' ? -1 : 1;
  const offsetMinutes = offsetMatch ? sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] || 0)) : 0;
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000).toISOString();
}

export function formatOsloDateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}
