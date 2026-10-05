import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type StatementLine = {
  description: string;
  completedAt?: string | null;
  grossNok: number;
  platformFeeNok: number;
  amountNok: number;
  entryType: string;
};

type StatementInput = {
  statementNumber: string;
  payoutDate: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  trainerName: string;
  organisationNumber?: string | null;
  bankAccount?: string | null;
  vatRegistered: boolean;
  grossNok: number;
  platformFeeNok: number;
  adjustmentsNok: number;
  payoutNok: number;
  paidAt?: string | null;
  lines: StatementLine[];
};

const fmt = (value: number) => `${new Intl.NumberFormat('nb-NO').format(value)} kr`;
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(value.includes('T') ? value : `${value}T12:00:00+02:00`)) : '-';

function clean(value: string) {
  return value.replace(/[\u2013\u2014]/g, '-').replace(/\t/g, ' ');
}

function wrap(text: string, max = 72) {
  const words = clean(text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildPayoutStatementPdf(input: StatementInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  let y = 800;
  const left = 44;
  const right = 551;

  const draw = (text: string, x: number, size = 10, useBold = false, yy?: number) => {
    page.drawText(clean(text), { x, y: yy ?? y, size, font: useBold ? bold : regular, color: rgb(0.12,0.12,0.12) });
  };
  const line = () => page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: rgb(0.75,0.75,0.75) });
  const newPage = () => { page = pdf.addPage(pageSize); y = 800; };

  draw('UTBETALINGSOPPGAVE', left, 20, true); y -= 25;
  draw(`Referanse: ${input.statementNumber}`, left, 9); y -= 14;
  draw(`Utbetalingsdato: ${date(input.payoutDate)}`, left, 9); y -= 14;
  if (input.periodStart && input.periodEnd) { draw(`Opptjeningsperiode: ${date(input.periodStart)} til ${date(input.periodEnd)}`, left, 9); y -= 14; }
  if (input.paidAt) { draw(`Betalt: ${date(input.paidAt)}`, left, 9); y -= 14; }
  y -= 8; line(); y -= 22;

  draw(input.trainerName, left, 13, true); y -= 17;
  if (input.organisationNumber) { draw(`Org.nr: ${input.organisationNumber}`, left, 9); y -= 13; }
  draw(`MVA-registrert: ${input.vatRegistered ? 'Ja' : 'Nei'}`, left, 9); y -= 13;
  if (input.bankAccount) { draw(`Kontonummer: ${input.bankAccount}`, left, 9); y -= 13; }
  y -= 12;

  draw('POSTER', left, 11, true); y -= 18;
  draw('Beskrivelse', left, 8, true); draw('Brutto', 355, 8, true); draw('Gebyr', 425, 8, true); draw('Din andel', 485, 8, true); y -= 9; line(); y -= 15;

  for (const item of input.lines) {
    if (y < 95) { newPage(); draw('UTBETALINGSOPPGAVE, forts.', left, 12, true); y -= 24; }
    const description = item.entryType === 'adjustment' ? `Justering: ${item.description}` : item.description;
    const wrapped = wrap(description, 48);
    draw(wrapped[0] || '', left, 8.5);
    draw(item.entryType === 'adjustment' ? '-' : fmt(item.grossNok), 350, 8.2);
    draw(item.entryType === 'adjustment' ? '-' : fmt(item.platformFeeNok), 420, 8.2);
    draw(fmt(item.amountNok), 485, 8.2, true);
    y -= 12;
    for (const extra of wrapped.slice(1)) { draw(extra, left, 8.2); y -= 11; }
    if (item.completedAt) { draw(`Dato: ${date(item.completedAt)}`, left, 7.5); y -= 11; }
    y -= 5;
  }

  if (y < 170) newPage();
  line(); y -= 20;
  draw('OPPSUMMERING', left, 11, true); y -= 18;
  draw('Brutto tjenester', left, 9); draw(fmt(input.grossNok), 475, 9, true); y -= 14;
  draw('Plattformandel', left, 9); draw(`-${fmt(input.platformFeeNok)}`, 475, 9); y -= 14;
  draw('Justeringer', left, 9); draw(fmt(input.adjustmentsNok), 475, 9); y -= 14;
  y -= 4; line(); y -= 18;
  draw('TIL UTBETALING', left, 11, true); draw(fmt(input.payoutNok), 475, 11, true); y -= 32;
  draw('Dette er en utbetalingsoversikt fra plattformen. Regnskapsmessig behandling og eventuell fakturadokumentasjon må følge avtalen mellom partene og gjeldende regler.', left, 7.5);

  return pdf.save();
}
