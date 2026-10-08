import { downloadHeaders } from '@/lib/exports';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTrainerAgreementPdf } from '@/lib/legal/trainer-agreement-pdf';
import { TRAINER_AGREEMENT_VERSION, trainerAgreementPlainText } from '@/lib/legal/trainer-agreement';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/vilkar/treneravtale', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));

  const admin = createAdminClient();
  const [{ data: profile }, { data: trainer }, { data: latest }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    admin.from('trainer_profiles').select('business_name,verification_status').eq('id', user.id).maybeSingle(),
    admin.from('trainer_verification_submissions').select('status,agreement_sent_at').eq('trainer_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const isAdmin = profile?.role === 'admin';
  const approvedTrainer = profile?.role === 'trainer' && ['approved', 'suspended'].includes(trainer?.verification_status || '');
  const invitedApplicant = latest?.status === 'pending' && Boolean(latest.agreement_sent_at);
  if (!isAdmin && !approvedTrainer && !invitedApplicant) return new NextResponse('Ikke funnet', { status: 404 });

  const bytes = await buildTrainerAgreementPdf({ agreementText: trainerAgreementPlainText(), version: TRAINER_AGREEMENT_VERSION, trainerName: trainer?.business_name || null });
  return new NextResponse(Buffer.from(bytes), { headers: downloadHeaders('application/pdf', 'hundetimer-treneravtale.pdf') });
}
