export function parseDogWeight(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Skriv inn en gyldig vekt (inntil to desimaler).');
  const weight = Number(raw.replace(',', '.'));
  if (!Number.isFinite(weight) || weight <= 0 || weight > 250) throw new Error('Skriv inn en gyldig vekt mellom 0 og 250 kg.');
  return weight;
}

export const DOG_PHOTO_BUCKET = 'dog-photos';
export const DOG_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

export async function validateDogPhoto(file: File) {
  if (file.size > DOG_PHOTO_MAX_BYTES) throw new Error('Bildet kan være maks 4 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b);
  const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  const extension = file.type === 'image/jpeg' && jpeg ? 'jpg' : file.type === 'image/png' && png ? 'png' : file.type === 'image/webp' && webp ? 'webp' : null;
  if (!extension) throw new Error('Velg et bilde i JPEG-, PNG- eller WebP-format.');
  return extension;
}
