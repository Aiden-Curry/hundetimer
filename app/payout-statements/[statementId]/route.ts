import { downloadHeaders, allExportRows } from '@/lib/exports';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPayoutStatementPdf } from '@/lib/finance/statement-pdf';

export async function GET(_request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

  const admin = createAdminClient();
  const { data: statement } = await admin.from('payout_statements').select('*').eq('id', statementId).maybeSingle();
  if (!statement) return NextResponse.json({ error: 'Fant ikke utbetalingsoppgaven.' }, { status: 404 });
  if (profile?.role !== 'admin' && statement.trainer_id !== user.id) return NextResponse.json({ error: 'Fant ikke utbetalingsoppgaven.' }, { status: 404 });

  try {
  const [{ data: batch, error: batchError }, { data: trainer, error: trainerError }, { data: payout, error: payoutError }, items] = await Promise.all([
    admin.from('payout_batches').select('payout_date, period_start, period_end, paid_at').eq('id', statement.batch_id).single(),
    admin.from('trainer_profiles').select('business_name').eq('id', statement.trainer_id).single(),
    admin.from('trainer_payout_profiles').select('organisation_number, bank_account_number, vat_registered').eq('trainer_id', statement.trainer_id).maybeSingle(),
    allExportRows((from, to) => admin.from('payout_items').select('ledger_entry_id').eq('batch_id', statement.batch_id).eq('trainer_id', statement.trainer_id).order('ledger_entry_id').range(from, to)),
  ]);
  if (batchError || trainerError || payoutError) throw new Error('Kunne ikke hente oppgjørsdata.');
  if (!batch || !trainer) return NextResponse.json({ error: 'Mangler utbetalingsdata.' }, { status: 404 });
  const ledgerIds = (items || []).map((item) => item.ledger_entry_id);
  const ledger = [];
  for (let offset=0; offset<ledgerIds.length; offset+=100) {
    ledger.push(...await allExportRows((from,to) => admin.from('trainer_ledger').select('id,entry_type,description,gross_service_nok,platform_fee_nok,amount_nok,completed_at').in('id',ledgerIds.slice(offset,offset+100)).eq('trainer_id', statement.trainer_id).order('id').range(from,to)));
  }
  if (ledger.length !== ledgerIds.length) throw new Error('Ufullstendige oppgjørsdata.');

  const bytes = await buildPayoutStatementPdf({
    statementNumber: statement.statement_number,
    payoutDate: batch.payout_date,
    periodStart: batch.period_start,
    periodEnd: batch.period_end,
    trainerName: trainer.business_name || 'Hundetrener',
    organisationNumber: payout?.organisation_number,
    bankAccount: payout?.bank_account_number,
    vatRegistered: Boolean(payout?.vat_registered),
    grossNok: statement.gross_service_nok,
    platformFeeNok: statement.platform_fee_nok,
    adjustmentsNok: statement.adjustments_nok,
    payoutNok: statement.payout_nok,
    paidAt: statement.paid_at || batch.paid_at,
    lines: (ledger || []).map((entry) => ({
      description: entry.description,
      completedAt: entry.completed_at,
      grossNok: entry.gross_service_nok,
      platformFeeNok: entry.platform_fee_nok,
      amountNok: entry.amount_nok,
      entryType: entry.entry_type,
    })),
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: downloadHeaders('application/pdf', `${statement.statement_number}.pdf`),
  });
  } catch {
    return NextResponse.json({ error: 'Utbetalingsoppgaven kunne ikke genereres. Prøv igjen senere.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
