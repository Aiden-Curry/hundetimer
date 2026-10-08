import { createDocument, documentColors, documentDate } from '@/lib/documents/pdf';

export async function buildTrainerAgreementPdf(input: {
  agreementText: string; version?: string; acceptedAt?: string | null; trainerName?: string | null;
  acceptanceId?: string | null; contentHash?: string | null; trainerSignatureName?: string | null;
  trainerSignedAt?: string | null; adminSignatureName?: string | null; adminSignedAt?: string | null;
}) {
  const doc = await createDocument('Hundetimer – treneravtale', 'Hundetimer · Treneravtale');
  doc.heading('Treneravtale', 27);
  if (input.trainerName) doc.paragraph(`Trener: ${input.trainerName}`, 11, true);
  doc.paragraph(input.trainerSignedAt && input.adminSignedAt ? 'Signert av begge parter' : input.trainerSignedAt ? 'Signert av trener · venter på Hundetimers signatur' : 'Avtale uten registrerte signaturer', 10);
  doc.y -= 12;
  let inClauses = false;
  for (const block of input.agreementText.split(/\r?\n/)) {
    const line = block.trim();
    if (/^\d+\./.test(line)) inClauses = true;
    // Omit template metadata only; retain the original signed clauses.
    if (!inClauses && (/^Versjon\b/i.test(line) || /^Språklig revidert\b/i.test(line) || /^HUNDETIMER\s*[-–]\s*TRENERAVTALE$/i.test(line))) continue;
    if (!line) { doc.y -= 6; continue; }
    if (/^\d+\./.test(line)) doc.heading(line, 12);
    else doc.paragraph(line, 10, false, 3);
  }
  if (input.acceptanceId || input.acceptedAt || input.trainerSignedAt || input.adminSignedAt) {
    doc.ensure(250);
    doc.y -= 12;
    doc.page.drawLine({ start: { x: doc.margin, y: doc.y }, end: { x: doc.width - doc.margin, y: doc.y }, color: documentColors.line, thickness: .8 });
    doc.y -= 28;
    doc.heading('Signaturer', 20);
    for (const [label, name, signedAt] of [
      ['Trener', input.trainerSignatureName || input.trainerName, input.trainerSignedAt],
      ['Hundetimer', input.adminSignatureName, input.adminSignedAt],
    ]) {
      doc.y -= 14; doc.heading(label || '', 14);
      if (signedAt) {
        doc.paragraph(name || label || '', 11, true);
        const time = new Intl.DateTimeFormat('nb-NO', { hour:'2-digit',minute:'2-digit',timeZone:'Europe/Oslo' }).format(new Date(signedAt));
        doc.paragraph(`Signert ${documentDate(signedAt)} kl. ${time} (norsk tid)`);
      } else doc.paragraph('Ingen signatur registrert.');
    }
  }
  return doc.save();
}
