const fs=require('fs');function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('app/account/privacy/export/route.ts',s=>s.replace("query.order('id');","query.order(table === 'online_course_lesson_content' ? 'lesson_id' : 'id');").replace("        // Lesson content uses lesson_id as its primary key.\n        allExportRows<Row>((from, to) => admin.from('online_course_lesson_content').select('*,online_courses!inner(trainer_id)').eq('online_courses.trainer_id', user.id).order('lesson_id').range(from, to)),", "        related(admin, 'online_course_lesson_content', 'course_id', courseIds),"));
for(const p of ['app/trainer-agreement/[acceptanceId]/route.ts','app/trainer-agreement/current/route.ts','app/payout-statements/[statementId]/route.ts','app/certificates/[purchaseId]/route.ts'])edit(p,s=>{
 s="import { downloadHeaders"+(p.includes('payout-statements')?', allExportRows':'')+" } from '@/lib/exports';\n"+s;
 if(p.includes('[acceptanceId]')){s=s.replace("  const bytes = await", "  if (!acceptance.agreement_snapshot?.trim()) return NextResponse.json({ error: 'Avtaleteksten mangler. Kontakt Hundetimer.' }, { status: 409 });\n  const bytes = await");s=s.replace(/headers: \{ 'Content-Type': 'application\/pdf', 'Content-Disposition': `attachment; filename="(.*?)"`, 'Cache-Control': 'no-store' \}/,"headers: downloadHeaders('application/pdf', `$1`)");}
 if(p.includes('/current/'))s=s.replace(/headers: \{ 'Content-Type': 'application\/pdf', 'Content-Disposition': `attachment; filename="(.*?)"`, 'Cache-Control': 'no-store' \}/,"headers: downloadHeaders('application/pdf', `$1`)");
 if(p.includes('certificates/'))s=s.replace("headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename=\"${filename}\"`,'Cache-Control':'private, no-store'}", "headers:downloadHeaders('application/pdf',filename)");
 if(p.includes('payout-statements')){
 s=s.replace("  const [{ data: batch }", "  try {\n  const [{ data: batch }");s=s.replace('{ data: items }','items');s=s.replace("admin.from('payout_items').select('ledger_entry_id').eq('batch_id', statement.batch_id).eq('trainer_id', statement.trainer_id),", "allExportRows((from, to) => admin.from('payout_items').select('ledger_entry_id').eq('batch_id', statement.batch_id).eq('trainer_id', statement.trainer_id).order('ledger_entry_id').range(from, to)),");
 const start=s.indexOf('  const { data: ledger }');const end=s.indexOf('\n  const bytes',start);
 s=s.slice(0,start)+`  const ledger = [];
  for (let offset=0; offset<ledgerIds.length; offset+=100) {
    ledger.push(...await allExportRows((from,to) => admin.from('trainer_ledger').select('id,entry_type,description,gross_service_nok,platform_fee_nok,amount_nok,completed_at').in('id',ledgerIds.slice(offset,offset+100)).eq('trainer_id', statement.trainer_id).order('id').range(from,to)));
  }
  if (ledger.length !== ledgerIds.length) throw new Error('Ufullstendige oppgjørsdata.');
`+s.slice(end);
 s=s.replace(/headers: \{\s*'Content-Type': 'application\/pdf',[\s\S]*?'Cache-Control': 'private, no-store',\s*\}/,"headers: downloadHeaders('application/pdf', `${statement.statement_number}.pdf`)");
 s=s.replace(/\n}\s*$/,"\n  } catch {\n    return NextResponse.json({ error: 'Utbetalingsoppgaven kunne ikke genereres. Prøv igjen senere.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });\n  }\n}\n");
 }
 return s;
});
