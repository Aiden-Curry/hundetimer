import { createAdminClient } from '@/lib/supabase/admin';

export type PromotionPreview = {
  promotion_id: string;
  promotion_name: string;
  code: string;
  original_subtotal_nok: number;
  discount_nok: number;
  discounted_subtotal_nok: number;
};

export async function previewPromotion(
  client: any,
  purchaseType: 'booking' | 'group' | 'online_course',
  itemId: string,
  code?: string | null,
): Promise<PromotionPreview | null> {
  const clean = String(code || '').trim();
  if (!clean) return null;
  const { data, error } = await client.rpc('preview_promotion', {
    p_purchase_type: purchaseType,
    p_item_id: itemId,
    p_code: clean,
  });
  if (error || !Array.isArray(data) || !data[0]) return null;
  return data[0] as PromotionPreview;
}

export async function applyPromotionToPurchase(
  purchaseType: 'booking' | 'group' | 'online_course',
  purchaseId: string,
  code?: string | null,
) {
  const clean = String(code || '').trim();
  if (!clean) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('apply_promotion_to_purchase', {
    p_purchase_type: purchaseType,
    p_purchase_id: purchaseId,
    p_code: clean,
  });
  if (error) throw error;
  return data;
}

export async function releasePromotionForPurchase(
  purchaseType: 'booking' | 'group' | 'online_course',
  purchaseId: string,
) {
  const { error } = await createAdminClient().rpc('release_promotion_for_purchase', {
    p_purchase_type: purchaseType,
    p_purchase_id: purchaseId,
  });
  if (error) throw error;
}

export async function redeemPromotionForPurchase(
  purchaseType: 'booking' | 'group' | 'online_course',
  purchaseId: string,
) {
  const { error } = await createAdminClient().rpc('redeem_promotion_for_purchase', {
    p_purchase_type: purchaseType,
    p_purchase_id: purchaseId,
  });
  if (error) throw error;
}
