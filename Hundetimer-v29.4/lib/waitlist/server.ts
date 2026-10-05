import { createAdminClient } from '@/lib/supabase/admin';
import { notifyPendingWaitlistOffers, notifyWaitlistOfferExpired } from '@/lib/email/waitlist-notifications';

export async function expireWaitlistOffersAndNotify() {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: expiring } = await admin.from('group_waitlist').select('id').eq('status','offered').lte('offer_expires_at', now).limit(200);
  const { data: expiredCount, error } = await admin.rpc('system_expire_group_waitlist_offers');
  if (error) throw error;
  for (const row of expiring || []) await notifyWaitlistOfferExpired(row.id);
  const offered = await notifyPendingWaitlistOffers();
  return { expiredWaitlistOffers:Number(expiredCount || 0), newWaitlistOffers:offered };
}
