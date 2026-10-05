import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Ingen tilgang.' }, { status: 403 });

  const admin = createAdminClient();
  const [{ data: batch }, { data: statements }] = await Promise.all([
    admin.from('payout_batches').select('id, payout_date, status').eq('id', batchId).single(),
    admin.from('payout_statements').select('id, trainer_id, statement_number, payout_nok').eq('batch_id', batchId).order('created_at'),
  ]);
  if (!batch) return NextResponse.json({ error: 'Fant ikke utbetalingsbatchen.' }, { status: 404 });
  const trainerIds = (statements || []).map((s) => s.trainer_id);
  const [{ data: trainers }, { data: payouts }] = trainerIds.length ? await Promise.all([
    admin.from('trainer_profiles').select('id, business_name').in('id', trainerIds),
    admin.from('trainer_payout_profiles').select('trainer_id, account_holder_name, bank_account_number, organisation_number').in('trainer_id', trainerIds),
  ]) : [{ data: [] }, { data: [] }];
  const trainerMap = new Map((trainers || []).map((x: any) => [x.id, x]));
  const payoutMap = new Map((payouts || []).map((x: any) => [x.trainer_id, x]));

  const rows = [['Kontoeier','Bedrift','Org.nr','Kontonummer','Belop NOK','Referanse','Utbetalingsdato']];
  for (const statement of statements || []) {
    const trainer: any = trainerMap.get(statement.trainer_id);
    const payout: any = payoutMap.get(statement.trainer_id);
    rows.push([
      payout?.account_holder_name || trainer?.business_name || '',
      trainer?.business_name || '',
      payout?.organisation_number || '',
      payout?.bank_account_number || '',
      String(statement.payout_nok),
      statement.statement_number,
      batch.payout_date,
    ]);
  }
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  await supabase.rpc('mark_payout_batch_exported', { p_batch_id: batchId });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="utbetaling-${batch.payout_date}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
