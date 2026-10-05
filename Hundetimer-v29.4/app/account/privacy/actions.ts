'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DELETION_GRACE_DAYS, ownerDeletionBlockers } from '@/lib/privacy/server';

function back(message: string, error = false): never { redirect(`/account/privacy?${error ? 'error' : 'message'}=${encodeURIComponent(message)}`); }

export async function savePrivacyPreferencesAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/privacy');
  const admin = createAdminClient();
  const marketingEmail = formData.get('marketingEmail') === 'on';
  const { error } = await admin.from('privacy_preferences').upsert({
    user_id: user.id,
    marketing_email: marketingEmail,
    product_updates: formData.get('productUpdates') === 'on',
    analytics_consent: formData.get('analyticsConsent') === 'on',
    updated_at: new Date().toISOString(),
  });
  if (error) back(error.message, true);
  const [{ data: profile }, auth] = await Promise.all([admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle(), admin.auth.admin.getUserById(user.id)]);
  const email = auth.data.user?.email || null;
  if (email) {
    const { data: existing } = await admin.from('newsletter_subscriptions').select('id').eq('scope','platform').eq('user_id',user.id).maybeSingle();
    if (marketingEmail) {
      const row = { scope:'platform', trainer_id:null, user_id:user.id, email, name:profile?.display_name || null, source:'account', subscribed_at:new Date().toISOString(), unsubscribed_at:null, updated_at:new Date().toISOString() };
      if (existing) await admin.from('newsletter_subscriptions').update(row).eq('id',existing.id); else await admin.from('newsletter_subscriptions').insert(row);
    } else if (existing) await admin.from('newsletter_subscriptions').update({ unsubscribed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id',existing.id);
  }
  revalidatePath('/account/privacy');
  back('Personvernvalgene er lagret.');
}

export async function requestAccountDeletionAction(formData: FormData) {
  const confirmation = String(formData.get('confirmation') || '').trim().toUpperCase();
  if (confirmation !== 'SLETT') back('Skriv SLETT for å bekrefte.', true);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/privacy');
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role,account_status').eq('id', user.id).maybeSingle();
  if (!profile) back('Fant ikke kontoen.', true);
  if (profile.role === 'admin') back('Administratorkontoer kan ikke slettes fra denne siden.', true);
  if (profile.role === 'owner') {
    const blockers = await ownerDeletionBlockers(admin, user.id);
    if (blockers.length) back(blockers.join(' '), true);
  }
  const now = new Date();
  const scheduled = new Date(now.getTime() + DELETION_GRACE_DAYS * 86400000).toISOString();
  const status = profile.role === 'trainer' ? 'requires_review' : 'pending';
  const { error } = await admin.from('account_deletion_requests').upsert({
    user_id: user.id,
    status,
    requested_at: now.toISOString(),
    scheduled_for: profile.role === 'trainer' ? null : scheduled,
    cancelled_at: null,
    completed_at: null,
    reviewed_at: null,
    reviewed_by: null,
    admin_note: null,
  }, { onConflict: 'user_id' });
  if (error) back(error.message, true);
  revalidatePath('/account/privacy');
  back(profile.role === 'trainer' ? 'Sletteforespørselen er sendt til administrator for gjennomgang.' : `Kontosletting er planlagt om ${DELETION_GRACE_DAYS} dager.`);
}

export async function cancelAccountDeletionAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account/privacy');
  const admin = createAdminClient();
  const { error } = await admin.from('account_deletion_requests').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), scheduled_for: null }).eq('user_id', user.id).in('status', ['pending','requires_review']);
  if (error) back(error.message, true);
  revalidatePath('/account/privacy');
  back('Sletteforespørselen er avbrutt.');
}
