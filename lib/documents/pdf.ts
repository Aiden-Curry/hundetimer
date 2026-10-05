import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const documentColors = { ink: rgb(.13,.26,.20), muted: rgb(.38,.44,.39), line: rgb(.83,.87,.82), cream: rgb(.97,.97,.94), sage: rgb(.91,.94,.88) };

/** Standard PDF fonts support Norwegian; normalize unsupported glyphs instead of crashing. */
export function documentText(value: string, font: PDFFont) {
  return Array.from(String(value).normalize('NFC').replace(/[\r\n\t]/g, ' ').replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-')).map(char => {
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
}
export function wrapDocumentText(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of documentText(value, font).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
export function documentDate(value?: string | null) {
  if (!value) return 'Ikke registrert';
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? 'Ukjent dato' : new Intl.DateTimeFormat('nb-NO', { day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Oslo' }).format(date);
}
export async function embedBrand(pdf: PDFDocument) {
  return pdf.embedPng(await readFile(path.join(process.cwd(), 'public/brand/hundetimer-mark.png')));
}

export async function createDocument(title: string, reference: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedBrand(pdf);
  const width = 595.28, height = 841.89, margin = 48, contentWidth = width - margin * 2;
  let page: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([width, height]);
    page.drawImage(logo, { x: margin, y: height - 68, width: 28, height: 28 });
    page.drawText('Hundetimer', { x: margin + 37, y: height - 58, font: bold, size: 15, color: documentColors.ink });
    page.drawLine({ start: { x: margin, y: height - 85 }, end: { x: width - margin, y: height - 85 }, color: documentColors.line, thickness: .7 });
    y = height - 119;
  };
  newPage();
  const ensure = (needed: number) => { if (y - needed < 64) { newPage(); return true; } return false; };
  const text = (value: string, x: number, yy: number, size = 10, strong = false, color = documentColors.ink) => {
    const font = strong ? bold : regular;
    page.drawText(documentText(value, font), { x, y: yy, size, font, color });
  };
  const paragraph = (value: string, size = 10, strong = false, gap = 6) => {
    for (const line of wrapDocumentText(value, strong ? bold : regular, size, contentWidth)) {
      ensure(size * 1.5); text(line, margin, y, size, strong); y -= size * 1.5;
    }
    y -= gap;
  };
  const heading = (value: string, size = 14) => {
    ensure(wrapDocumentText(value, bold, size, contentWidth).length * size * 1.5 + 36);
    paragraph(value, size, true, 9);
  };
  const right = (value: string, x: number, yy: number, size = 9, strong = false, maxWidth = 80) => {
    const font = strong ? bold : regular, safe = documentText(value, font);
    while (font.widthOfTextAtSize(safe, size) > maxWidth && size > 5) size -= .25;
    text(safe, x - font.widthOfTextAtSize(safe, size), yy, size, strong);
  };
  return {
    pdf, regular, bold, margin, contentWidth, width, height, text, right, paragraph, heading, ensure, newPage,
    get page() { return page; }, get y() { return y; }, set y(value: number) { y = value; },
    async save() {
      const pages = pdf.getPages();
      pages.forEach((p, index) => {
        p.drawLine({ start: { x: margin, y: 44 }, end: { x: width-margin, y: 44 }, color: documentColors.line, thickness: .6 });
        const safe = documentText(reference, regular);
        const size = Math.min(8, 380 / Math.max(regular.widthOfTextAtSize(safe, 1), 1));
        p.drawText(safe, { x:margin, y:29, size, font:regular, color:documentColors.muted });
        p.drawText(`${index+1} / ${pages.length}`, { x:width-margin-30, y:29, size:8, font:regular, color:documentColors.muted });
      });
      pdf.setTitle(title); pdf.setAuthor('Hundetimer'); pdf.setCreator('Hundetimer'); pdf.setProducer('Hundetimer');
      return pdf.save();
    },
  };
}
