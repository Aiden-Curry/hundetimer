import { createDocument, documentDate } from '@/lib/documents/pdf';
import { TRAINER_AGREEMENT_VERSION } from '@/lib/legal/trainer-agreement';

export async function buildTrainerAgreementPdf(input: {
  agreementText: string; version?: string; acceptedAt?: string | null; trainerName?: string | null;
  acceptanceId?: string | null; contentHash?: string | null; trainerSignatureName?: string | null;
  trainerSignedAt?: string | null; adminSignatureName?: string | null; adminSignedAt?: string | null;
}) {
  const version = input.version || TRAINER_AGREEMENT_VERSION;
  const doc = await createDocument(`Hundetimer treneravtale v${version}`, `Treneravtale · versjon ${version}`);
  doc.heading('Treneravtale', 27);
  doc.paragraph(`Versjon ${version}`, 10);
  if (input.trainerName) doc.paragraph(`Trener: ${input.trainerName}`, 11, true);
  doc.paragraph(input.trainerSignedAt && input.adminSignedAt ? 'Signert av begge parter' : input.trainerSignedAt ? 'Signert av trener · venter på Hundetimers signatur' : 'Avtale uten registrerte signaturer', 10);
  doc.y -= 12;
  for (const block of input.agreementText.split(/\r?\n/)) {
    const line = block.trim();
    if (!line) { doc.y -= 6; continue; }
    if (/^\d+\./.test(line) || line === 'HUNDETIMER - TRENERAVTALE') doc.heading(line, 12);
    else doc.paragraph(line, 10, false, 3);
  }
  if (input.acceptanceId || input.acceptedAt || input.trainerSignedAt || input.adminSignedAt) {
    doc.newPage();
    doc.heading('Signaturer og dokumentasjon', 22);
    doc.paragraph('Signaturstatusen nedenfor gjelder denne lagrede avtaleversjonen.', 10);
    for (const [label, name, signedAt] of [
      ['Trener', input.trainerSignatureName || input.trainerName, input.trainerSignedAt],
      ['Hundetimer', input.adminSignatureName, input.adminSignedAt],
    ]) {
      doc.y -= 14; doc.heading(label || '', 14);
      if (signedAt) {
        doc.paragraph(name || label || '', 11, true);
        const time = new Intl.DateTimeFormat('nb-NO', { hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo' }).format(new Date(signedAt));
        doc.paragraph(`Signert ${documentDate(signedAt)} kl. ${time} (Europe/Oslo)`);
      } else doc.paragraph('Ingen signatur registrert.');
    }
    doc.y -= 20;
    if (input.acceptedAt) doc.paragraph(`Aksept registrert: ${documentDate(input.acceptedAt)}`, 9);
    if (input.acceptanceId) doc.paragraph(`Avtale-ID: ${input.acceptanceId}`, 9);
    if (input.contentHash) { doc.heading('Dokumentets SHA-256', 11); doc.paragraph(input.contentHash, 8.5); }
  }
  return doc.save();
}
