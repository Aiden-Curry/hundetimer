import type { NextRequest } from 'next/server';
import { expireOverdueTrainerResponses } from '@/lib/bookings/expiry';
import { expireWaitlistOffersAndNotify } from '@/lib/waitlist/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [result, waitlist] = await Promise.all([expireOverdueTrainerResponses(), expireWaitlistOffersAndNotify()]);
    return Response.json({ ok: true, ...result, ...waitlist });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Ukjent feil.' }, { status: 500 });
  }
}
