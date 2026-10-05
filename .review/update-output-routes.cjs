const fs=require('fs');const p='app/admin/payouts/[batchId]/export/route.ts';let s=fs.readFileSync(p,'utf8');s=s.replace("import { NextResponse }", "import { allExportRows, csvDocument, downloadHeaders } from '@/lib/exports';\nimport { NextResponse }");s=s.replace(/function csvCell[\s\S]*?\n}\r?\n/,'');s=s.replace('  const admin = createAdminClient();','  try {\n  const admin = createAdminClient();').replace('{ data: statements }','statements').replace("admin.from('payout_statements').select('id, trainer_id, statement_number, payout_nok').eq('batch_id', batchId).order('created_at'),", "allExportRows((from, to) => admin.from('payout_statements').select('id, trainer_id, statement_number, payout_nok').eq('batch_id', batchId).order('id').range(from, to)),");
const start=s.indexOf('  const trainerIds =');const end=s.indexOf('  const trainerMap',start);s=s.slice(0,start)+`  const trainerIds = [...new Set(statements.map(s => s.trainer_id))];
  const trainers = [], payouts = [];
  for (let offset = 0; offset < trainerIds.length; offset += 100) {
    const ids = trainerIds.slice(offset, offset + 100);
    const [trainerRows, payoutRows] = await Promise.all([
      allExportRows((from, to) => admin.from('trainer_profiles').select('id,business_name').in('id', ids).order('id').range(from, to)),
      allExportRows((from, to) => admin.from('trainer_payout_profiles').select('trainer_id,account_holder_name,bank_account_number,organisation_number').in('trainer_id', ids).order('trainer_id').range(from, to)),
    ]);
    trainers.push(...trainerRows); payouts.push(...payoutRows);
  }
`+s.slice(end);
s=s.replace("  const rows = [['Kontoeier'", "  const rows: unknown[][] = [['Kontoeier'");s=s.replace("    rows.push([", "    if (!payout?.bank_account_number || !Number.isFinite(statement.payout_nok)) return NextResponse.json({ error: 'Eksporten mangler kontonummer eller et gyldig beløp. Kontroller oppgjøret før eksport.' }, { status: 409 });\n    rows.push([");s=s.replace('String(statement.payout_nok)','statement.payout_nok');const tail=s.indexOf("  const csv = '\\uFEFF'");s=s.slice(0,tail)+`  const csv = csvDocument(rows);
  const { error: exportError } = await supabase.rpc('mark_payout_batch_exported', { p_batch_id: batchId });
  if (exportError) throw new Error('Kunne ikke registrere eksporten.');
  return new NextResponse(csv, { headers: downloadHeaders('text/csv; charset=utf-8', \`utbetaling-\${batch.payout_date}.csv\`) });
  } catch {
    return NextResponse.json({ error: 'Eksporten kunne ikke fullføres. Prøv igjen senere.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
`;fs.writeFileSync(p,s);
