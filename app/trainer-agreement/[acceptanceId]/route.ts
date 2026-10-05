import { downloadHeaders } from '@/lib/exports';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTrainerAgreementPdf } from '@/lib/legal/trainer-agreement-pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ acceptanceId: string }> }) {
  const { acceptanceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(new URL(request.url).pathname)}`, request.url));
  const admin = createAdminClient();
  const [{ data: profile }, { data: acceptance }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    admin.from('trainer_agreement_acceptances').select('*').eq('id', acceptanceId).maybeSingle(),
  ]);
  if (!acceptance || (acceptance.trainer_id !== user.id && profile?.role !== 'admin')) return new NextResponse('Ikke funnet', { status: 404 });
  const { data: trainer } = await admin.from('trainer_profiles').select('business_name').eq('id', acceptance.trainer_id).maybeSingle();
  if (!acceptance.agreement_snapshot?.trim()) return NextResponse.json({ error: 'Avtaleteksten mangler. Kontakt Hundetimer.' }, { status: 409 });
  const bytes = await buildTrainerAgreementPdf({ agreementText: acceptance.agreement_snapshot, version: acceptance.agreement_version, acceptedAt: acceptance.accepted_at, trainerName: trainer?.business_name || null, acceptanceId: acceptance.id, contentHash: acceptance.content_sha256, trainerSignatureName: acceptance.trainer_signature_name, trainerSignedAt: acceptance.trainer_signed_at, adminSignatureName: acceptance.admin_signature_name, adminSignedAt: acceptance.admin_signed_at });
  return new NextResponse(Buffer.from(bytes), { headers: downloadHeaders('application/pdf', `hundetimer-treneravtale-v${acceptance.agreement_version}-${acceptance.id.slice(0,8)}.pdf`) });
}
