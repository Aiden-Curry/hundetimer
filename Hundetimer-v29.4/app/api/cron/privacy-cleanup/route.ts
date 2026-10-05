import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processAccountDeletion } from '@/lib/privacy/server';

export const dynamic = 'force-dynamic';

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error:'Unauthorized' },{status:401});
  const admin = createAdminClient();
  const { data: due, error } = await admin.from('account_deletion_requests').select('id,user_id').eq('status','pending').lte('scheduled_for',new Date().toISOString()).limit(50);
  if (error) return NextResponse.json({ error:error.message },{status:500});
  const results: {user_id:string;ok:boolean;error?:string}[] = [];
  for (const item of due || []) {
    try { await processAccountDeletion(item.user_id); results.push({user_id:item.user_id,ok:true}); }
    catch (e) { results.push({user_id:item.user_id,ok:false,error:e instanceof Error?e.message:'Ukjent feil'}); }
  }
  return NextResponse.json({ processed:results.length, results });
}
export const GET = run;
export const POST = run;
