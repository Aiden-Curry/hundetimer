import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TRAINER_AGREEMENT_VERSION } from '@/lib/legal/trainer-agreement';

function wrap(text: string, max = 92) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildTrainerAgreementPdf(input: {
  agreementText: string;
  version?: string;
  acceptedAt?: string | null;
  trainerName?: string | null;
  acceptanceId?: string | null;
  contentHash?: string | null;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 52;
  const ink = rgb(0.14, 0.25, 0.2);
  const muted = rgb(0.37, 0.4, 0.38);
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const newPage = () => { page = pdf.addPage(pageSize); y = pageSize[1] - margin; };
  const drawLine = (text: string, size = 9.5, isBold = false, gap = 13) => {
    if (y < margin + 24) newPage();
    page.drawText(text, { x: margin, y, size, font: isBold ? bold : regular, color: isBold ? ink : muted });
    y -= gap;
  };

  drawLine('Hundetimer', 17, true, 23);
  drawLine(`Treneravtale, versjon ${input.version || TRAINER_AGREEMENT_VERSION}`, 12, true, 18);
  if (input.acceptedAt) drawLine(`Akseptert: ${new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Oslo' }).format(new Date(input.acceptedAt))}`, 9, false, 13);
  if (input.trainerName) drawLine(`Trener: ${input.trainerName}`, 9, false, 13);
  if (input.acceptanceId) drawLine(`Aksept-ID: ${input.acceptanceId}`, 8, false, 12);
  if (input.contentHash) drawLine(`Dokumenthash: ${input.contentHash}`, 7, false, 16);
  y -= 5;

  const blocks = input.agreementText.split(/\n/);
  for (const block of blocks) {
    const line = block.trim();
    if (!line) { y -= 7; continue; }
    const heading = /^\d+\./.test(line) || line === 'HUNDETIMER - TRENERAVTALE';
    const size = heading ? 10.5 : 9.2;
    const max = heading ? 82 : 96;
    if (heading) y -= 3;
    for (const wrapped of wrap(line, max)) drawLine(wrapped, size, heading, heading ? 14 : 12.5);
    if (heading) y -= 2;
  }

  pdf.setTitle(`Hundetimer treneravtale v${input.version || TRAINER_AGREEMENT_VERSION}`);
  pdf.setAuthor('Hundetimer');
  pdf.setSubject('Treneravtale');
  return pdf.save();
}
