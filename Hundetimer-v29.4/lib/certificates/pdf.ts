import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function formatDate(value:string){
  return new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Oslo'}).format(new Date(value));
}

function pdfSafe(text:string){return text.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g,' ').replace(/\s+/g,' ').trim();}
function fitText(text:string,max=80){
  const clean=pdfSafe(text);
  return clean.length>max?`${clean.slice(0,max-3)}...`:clean;
}

export async function buildCourseCertificatePdf(input:{
  certificateId:string;
  holderName:string;
  courseTitle:string;
  trainerName:string;
  completedAt:string;
  subtitle?:string|null;
  dogName?:string|null;
  verifyUrl:string;
}){
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([842,595]);
  const {width,height}=page.getSize();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif=await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ink=rgb(0.12,0.14,0.12);
  const soft=rgb(0.39,0.44,0.36);
  const line=rgb(0.82,0.80,0.73);
  const cream=rgb(0.97,0.96,0.92);

  page.drawRectangle({x:0,y:0,width,height,color:cream});
  page.drawRectangle({x:24,y:24,width:width-48,height:height-48,borderColor:soft,borderWidth:1.4});
  page.drawRectangle({x:34,y:34,width:width-68,height:height-68,borderColor:line,borderWidth:0.7});

  const centered=(text:string,font:any,size:number,y:number,color=ink)=>{
    const safe=pdfSafe(text);
    const tw=font.widthOfTextAtSize(safe,size);
    page.drawText(safe,{x:(width-tw)/2,y,font,size,color});
  };

  centered('KURSBEVIS',bold,15,height-92,soft);
  centered('Fullført nettkurs',regular,12,height-116,soft);
  page.drawLine({start:{x:225,y:height-136},end:{x:617,y:height-136},thickness:0.7,color:line});

  centered('Dette bekrefter at',regular,13,height-180,soft);
  centered(fitText(input.holderName,62),serif,29,height-224,ink);
  centered('har fullført',regular,13,height-256,soft);
  centered(fitText(input.courseTitle,68),bold,22,height-295,ink);

  if(input.subtitle){
    centered(fitText(input.subtitle,92),regular,11,height-326,soft);
  }
  if(input.dogName){
    centered(`Kurset ble gjennomført med ${fitText(input.dogName,45)}`,regular,10,height-350,soft);
  }

  centered(`Fullført ${formatDate(input.completedAt)}`,regular,12,156,ink);
  centered(`Instruktør: ${fitText(input.trainerName,55)}`,bold,12,132,ink);

  page.drawLine({start:{x:125,y:104},end:{x:717,y:104},thickness:0.7,color:line});
  page.drawText(`Kursbevis-ID: ${input.certificateId}`,{x:62,y:76,font:regular,size:8.5,color:soft});
  const verify=fitText(input.verifyUrl,92);
  const verifyWidth=regular.widthOfTextAtSize(verify,8.5);
  page.drawText(verify,{x:width-62-verifyWidth,y:76,font:regular,size:8.5,color:soft});

  pdf.setTitle(`${input.courseTitle} - kursbevis`);
  pdf.setSubject('Kursbevis for fullført nettkurs');
  pdf.setCreator('Hundetimer');
  pdf.setProducer('Hundetimer');
  return pdf.save();
}
