import { createDocument, documentDate, documentColors, wrapDocumentText } from '@/lib/documents/pdf';

type StatementLine = { description: string; completedAt?: string | null; grossNok: number; platformFeeNok: number; amountNok: number; entryType: string };
type StatementInput = {
  statementNumber: string; payoutDate: string; periodStart?: string | null; periodEnd?: string | null;
  trainerName: string; organisationNumber?: string | null; bankAccount?: string | null; vatRegistered: boolean;
  grossNok: number; platformFeeNok: number; adjustmentsNok: number; payoutNok: number; paidAt?: string | null; lines: StatementLine[];
};
const money = (value: number) => `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(value)} kr`;

export async function buildPayoutStatementPdf(input: StatementInput) {
  const doc = await createDocument(`Utbetalingsoppgave ${input.statementNumber}`, input.statementNumber);
  doc.heading('Utbetalingsoppgave', 26);
  doc.paragraph(`Referanse: ${input.statementNumber}`, 10);
  doc.paragraph(`${input.paidAt ? 'Betalt' : 'Planlagt utbetaling'}: ${documentDate(input.paidAt || input.payoutDate)}`, 10, true);
  if (input.periodStart && input.periodEnd) doc.paragraph(`Periode: ${documentDate(input.periodStart)} – ${documentDate(input.periodEnd)}`, 9);
  doc.y -= 10;
  doc.heading(input.trainerName, 15);
  if (input.organisationNumber) doc.paragraph(`Org.nr. ${input.organisationNumber}`, 9);
  doc.paragraph(`MVA-registrert: ${input.vatRegistered ? 'Ja' : 'Nei'}`, 9);
  if (input.bankAccount) doc.paragraph(`Kontonummer: ${input.bankAccount}`, 9);
  doc.y -= 12;
  const right = doc.width - doc.margin;
  const tableHead = () => {
    doc.page.drawRectangle({ x:doc.margin, y:doc.y-7, width:doc.contentWidth, height:24, color:documentColors.sage });
    doc.text('Beskrivelse', doc.margin+8, doc.y, 9, true);
    doc.right('Brutto', 371, doc.y, 8, true); doc.right('Gebyr', 452, doc.y, 8, true); doc.right('Din andel', right-8, doc.y, 8, true);
    doc.y -= 29;
  };
  if (doc.ensure(60)) doc.heading('Poster', 14);
  tableHead();
  for (const item of input.lines) {
    const lines = wrapDocumentText(`${item.entryType === 'adjustment' ? 'Justering: ' : ''}${item.description || 'Opptjening'}`, doc.regular, 9, 236);
    for (let i = 0; i < lines.length; i++) {
      if (doc.ensure(24)) tableHead();
      doc.text(lines[i], doc.margin+8, doc.y, 9);
      if (i === 0) {
        doc.right(item.entryType === 'adjustment' ? '–' : money(item.grossNok), 371, doc.y, 8.5, false, 72);
        doc.right(item.entryType === 'adjustment' ? '–' : money(item.platformFeeNok), 452, doc.y, 8.5, false, 72);
        doc.right(money(item.amountNok), right-8, doc.y, 8.5, true, 78);
      }
      doc.y -= 13;
    }
    if (item.completedAt) { if (doc.ensure(24)) tableHead(); doc.text(documentDate(item.completedAt), doc.margin+8, doc.y, 8, false, documentColors.muted); doc.y -= 13; }
    doc.y -= 8;
  }
  if (!input.lines.length) doc.paragraph('Ingen spesifiserte poster.', 9);
  doc.ensure(220); doc.y -= 12; doc.heading('Oppsummering', 14);
  for (const [label, value] of [['Brutto tjenester', input.grossNok], ['Plattformandel', -input.platformFeeNok], ['Justeringer', input.adjustmentsNok]] as const) {
    doc.text(label, doc.margin, doc.y, 10); doc.right(money(value), right, doc.y, 10, false, 150); doc.y -= 21;
  }
  doc.y -= 14;
  doc.page.drawRectangle({x:doc.margin,y:doc.y-13,width:doc.contentWidth,height:36,color:documentColors.sage});
  doc.text('Til utbetaling', doc.margin+10, doc.y, 12, true); doc.right(money(input.payoutNok), right-10, doc.y, 13, true, 200); doc.y -= 44;
  doc.paragraph('Dette er en utbetalingsoversikt fra plattformen. Regnskapsmessig behandling og eventuell fakturadokumentasjon må følge avtalen mellom partene og gjeldende regler.', 8.5);
  return doc.save();
}
