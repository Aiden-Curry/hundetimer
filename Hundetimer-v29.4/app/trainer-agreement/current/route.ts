import { NextResponse } from 'next/server';
import { buildTrainerAgreementPdf } from '@/lib/legal/trainer-agreement-pdf';
import { TRAINER_AGREEMENT_VERSION, trainerAgreementPlainText } from '@/lib/legal/trainer-agreement';

export const dynamic = 'force-dynamic';

export async function GET() {
  const bytes = await buildTrainerAgreementPdf({ agreementText: trainerAgreementPlainText(), version: TRAINER_AGREEMENT_VERSION });
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="hundetimer-treneravtale-v${TRAINER_AGREEMENT_VERSION}.pdf"`, 'Cache-Control': 'no-store' } });
}
