import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { allExportRows, csvDocument, downloadHeaders } from '@/lib/exports';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Ikke innlogget.', { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return new Response('Ingen tilgang.', { status: 403 });
  try {
    const admin = createAdminClient();
    const data = await allExportRows((from, to) => admin.from('newsletter_subscriptions')
      .select('email,name,source,subscribed_at,consent_version').eq('scope', 'platform')
      .is('unsubscribed_at', null).order('subscribed_at', { ascending: false }).order('id').range(from, to));
    const csv = csvDocument([
      ['email', 'name', 'source', 'subscribed_at', 'consent_version'],
      ...data.map(row => [row.email, row.name, row.source, row.subscribed_at, row.consent_version]),
    ], ',');
    return new Response(csv, { headers: downloadHeaders('text/csv; charset=utf-8', `hundetimer-nyhetsbrev-${new Date().toISOString().slice(0, 10)}.csv`) });
  } catch {
    return new Response('Eksporten kunne ikke fullføres. Prøv igjen senere.', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
