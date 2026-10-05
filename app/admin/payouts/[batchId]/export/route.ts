import { allExportRows, csvDocument, downloadHeaders } from '@/lib/exports';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';


export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Ingen tilgang.' }, { status: 403 });

  try {
  const admin = createAdminClient();
  const [{ data: batch }, statements] = await Promise.all([
    admin.from('payout_batches').select('id, payout_date, status').eq('id', batchId).single(),
    allExportRows((from, to) => admin.from('payout_statements').select('id, trainer_id, statement_number, payout_nok').eq('batch_id', batchId).order('id').range(from, to)),
  ]);
  if (!batch) return NextResponse.json({ error: 'Fant ikke utbetalingsbatchen.' }, { status: 404 });
  const trainerIds = [...new Set(statements.map(s => s.trainer_id))];
  const trainers = [], payouts = [];
  for (let offset = 0; offset < trainerIds.length; offset += 100) {
    const ids = trainerIds.slice(offset, offset + 100);
    const [trainerRows, payoutRows] = await Promise.all([
      allExportRows((from, to) => admin.from('trainer_profiles').select('id,business_name').in('id', ids).order('id').range(from, to)),
      allExportRows((from, to) => admin.from('trainer_payout_profiles').select('trainer_id,account_holder_name,bank_account_number,organisation_number').in('trainer_id', ids).order('trainer_id').range(from, to)),
    ]);
    trainers.push(...trainerRows); payouts.push(...payoutRows);
  }
  const trainerMap = new Map((trainers || []).map((x: any) => [x.id, x]));
  const payoutMap = new Map((payouts || []).map((x: any) => [x.trainer_id, x]));

  const rows: unknown[][] = [['Kontoeier','Bedrift','Org.nr','Kontonummer','Belop NOK','Referanse','Utbetalingsdato']];
  for (const statement of statements || []) {
    const trainer: any = trainerMap.get(statement.trainer_id);
    const payout: any = payoutMap.get(statement.trainer_id);
    if (!payout?.bank_account_number || !Number.isFinite(statement.payout_nok)) return NextResponse.json({ error: 'Eksporten mangler kontonummer eller et gyldig beløp. Kontroller oppgjøret før eksport.' }, { status: 409 });
    rows.push([
      payout?.account_holder_name || trainer?.business_name || '',
      trainer?.business_name || '',
      payout?.organisation_number || '',
      payout?.bank_account_number || '',
      statement.payout_nok,
      statement.statement_number,
      batch.payout_date,
    ]);
  }
  const csv = csvDocument(rows);
  const { error: exportError } = await supabase.rpc('mark_payout_batch_exported', { p_batch_id: batchId });
  if (exportError) throw new Error('Kunne ikke registrere eksporten.');
  return new NextResponse(csv, { headers: downloadHeaders('text/csv; charset=utf-8', `utbetaling-${batch.payout_date}.csv`) });
  } catch {
    return NextResponse.json({ error: 'Eksporten kunne ikke fullføres. Prøv igjen senere.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
