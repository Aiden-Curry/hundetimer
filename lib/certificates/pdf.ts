import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { documentColors as colors, documentDate, embedBrand, wrapDocumentText } from '@/lib/documents/pdf';

export async function buildCourseCertificatePdf(input: {
  certificateId: string; holderName: string; courseTitle: string; trainerName: string; completedAt: string;
  subtitle?: string | null; dogName?: string | null; verifyUrl: string;
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const logo = await embedBrand(pdf);
  const width = 842, height = 595;
  page.drawRectangle({x:0,y:0,width,height,color:colors.cream});
  page.drawRectangle({x:28,y:28,width:width-56,height:height-56,borderColor:colors.line,borderWidth:1});
  page.drawRectangle({x:28,y:28,width:8,height:height-56,color:colors.ink});
  page.drawImage(logo,{x:62,y:height-93,width:32,height:32});
  page.drawText('Hundetimer',{x:105,y:height-82,size:16,font:bold,color:colors.ink});
  page.drawText('KURSBEVIS',{x:62,y:height-138,size:11,font:bold,color:colors.muted});
  function centered(text:string, font:typeof regular, startSize:number, top:number, maxLines:number, maxWidth=690) {
    let size=startSize;
    let lines=wrapDocumentText(text,font,size,maxWidth);
    while(lines.length>maxLines && size>4){size-=.5;lines=wrapDocumentText(text,font,size,maxWidth);}
    for(let i=0;i<lines.length;i++)page.drawText(lines[i],{x:(width-font.widthOfTextAtSize(lines[i],size))/2,y:top-i*size*1.2,size,font,color:colors.ink});
  }
  centered('Dette bekrefter at',regular,11,420,1);
  centered(input.holderName,serif,30,386,2);
  centered('har fullført',regular,11,318,1);
  centered(input.courseTitle,bold,23,287,3);
  if(input.subtitle)centered(input.subtitle,regular,11,207,2);
  if(input.dogName)centered(`Gjennomført med ${input.dogName}`,regular,10,171,1);
  page.drawLine({start:{x:62,y:148},end:{x:780,y:148},color:colors.line,thickness:.7});
  centered(`Fullført ${documentDate(input.completedAt)}`,regular,10,127,1);
  centered(`Instruktør: ${input.trainerName}`,bold,11,108,1);
  centered(`Kursbevis-ID: ${input.certificateId}`,regular,8,79,1);
  const verifyUrl = new URL(input.verifyUrl);
  centered(`${verifyUrl.host}${verifyUrl.pathname}`,regular,8.5,59,1);
  const link=pdf.context.register(pdf.context.obj({Type:PDFName.of('Annot'),Subtype:PDFName.of('Link'),Rect:[62,52,780,72],Border:[0,0,0],A:{Type:PDFName.of('Action'),S:PDFName.of('URI'),URI:PDFString.of(verifyUrl.href)}}));
  page.node.set(PDFName.of('Annots'),pdf.context.obj([link]));
  pdf.setTitle(`${input.courseTitle} – kursbevis`);pdf.setSubject('Kursbevis for fullført nettkurs');pdf.setAuthor('Hundetimer');pdf.setCreator('Hundetimer');
  return pdf.save();
}
