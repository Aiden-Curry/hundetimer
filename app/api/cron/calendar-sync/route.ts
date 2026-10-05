import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncTrainerBusyTime } from '@/lib/calendar/server';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: connections } = await admin.from('calendar_connections').select('trainer_id').eq('sync_busy', true);
  let synced = 0;
  let failed = 0;
  for (const row of connections || []) {
    try { await syncTrainerBusyTime(row.trainer_id, 60); synced += 1; } catch { failed += 1; }
  }
  return NextResponse.json({ synced, failed });
}
