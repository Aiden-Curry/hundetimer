'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTrainerJourney } from '@/lib/trainer-journey-server';
import { refundOnlineCoursePurchase } from '@/lib/stripe/online-course-refunds';
import { notifyCoursePurchaseEvent } from '@/lib/email/course-purchase-events';

export async function manageCoursePurchaserAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Du må logge inn.' };
    const journey = await getTrainerJourney();
    if (!journey || journey.accessError || !['stripe','ready'].includes(journey.stage)) return { ok: false, message: 'Du har ikke tilgang.' };
    const purchaseId = String(formData.get('purchaseId') || '');
    const operation = String(formData.get('operation') || '');
    if (!['refund','revoke','restore'].includes(operation)) return { ok: false, message: 'Ugyldig handling.' };
    const { data: purchase, error } = await supabase.from('online_course_purchases').select('id,course_id').eq('id', purchaseId).maybeSingle();
    if (error || !purchase) return { ok: false, message: 'Fant ikke kjøpet.' };
    const { data: course } = await supabase.from('online_courses').select('id').eq('id', purchase.course_id).eq('trainer_id', user.id).maybeSingle();
    if (!course) return { ok: false, message: 'Fant ikke kjøpet.' };
    let message: string;
    if (operation === 'refund') {
      const status = await refundOnlineCoursePurchase(purchase.id);
      message = status === 'succeeded' ? 'Kjøpet er refundert.' : status === 'failed' || status === 'canceled' ? 'Refusjonen feilet. Tilgangen er ikke endret.' : 'Refusjonen behandles. Tilgangen beholdes til refusjonen er bekreftet.';
    } else {
      const { data, error: accessError } = await supabase.rpc('set_online_course_purchase_access', { p_purchase_id: purchase.id, p_revoke: operation === 'revoke', p_reason: String(formData.get('reason') || '').trim().slice(0,500) || null });
      if (accessError) throw accessError;
      if (data?.event_key) await notifyCoursePurchaseEvent(data.event_key);
      message = operation === 'revoke' ? 'Tilgangen er fjernet.' : 'Tilgangen er gjenopprettet.';
    }
    revalidatePath(`/trainer-dashboard/online-courses/${course.id}`);
    revalidatePath('/trainer-dashboard/finance');
    revalidatePath('/account');
    revalidatePath(`/learn/${purchase.id}`, 'layout');
    return { ok: true, message };
  } catch (error) {
    console.error('[course purchaser action]', error);
    return { ok: false, message: 'Handlingen kunne ikke fullføres. Prøv igjen om litt eller kontakt kundeservice.' };
  }
}
