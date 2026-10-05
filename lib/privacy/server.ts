import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export const DELETION_GRACE_DAYS = 7;

export async function ownerDeletionBlockers(admin: AdminClient, userId: string) {
  const [bookings, groups, waitlist, refunds] = await Promise.all([
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('customer_id', userId).in('status', ['pending','confirmed','reschedule_offered']),
    admin.from('group_enrollments').select('id', { count: 'exact', head: true }).eq('customer_id', userId).in('status', ['checkout_pending','confirmed']),
    admin.from('group_waitlist').select('id', { count: 'exact', head: true }).eq('customer_id', userId).in('status', ['waiting','offered','checkout']),
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('customer_id', userId).eq('refund_status', 'pending'),
  ]);
  const result: string[] = [];
  if ((bookings.count || 0) > 0) result.push('Du har aktive privattimer som må avbestilles eller fullføres først.');
  if ((groups.count || 0) > 0) result.push('Du har aktive kurs-/arrangementspåmeldinger som må avsluttes først.');
  if ((waitlist.count || 0) > 0) result.push('Du står på en aktiv venteliste. Trekk deg fra ventelisten først.');
  if ((refunds.count || 0) > 0) result.push('En refusjon behandles fortsatt. Vent til den er ferdig.');
  return result;
}

async function removeFolder(admin: AdminClient, bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).list(path, { limit: 1000 });
  if (error || !data?.length) return;
  const files: string[] = [];
  for (const item of data) {
    const child = `${path}/${item.name}`;
    if (item.id) files.push(child);
    else await removeFolder(admin, bucket, child);
  }
  if (files.length) await admin.storage.from(bucket).remove(files);
}

export async function processAccountDeletion(userId: string) {
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from('profiles').select('id,role,display_name').eq('id', userId).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error('Fant ikke kontoen.');
  if (profile.role === 'admin') throw new Error('Administratorkontoer må behandles manuelt.');

  if (profile.role === 'owner') {
    const blockers = await ownerDeletionBlockers(admin, userId);
    if (blockers.length) throw new Error(blockers.join(' '));
  }

  // Remove data that is useful only to the user, while retaining transaction records.
  await Promise.all([
    admin.from('saved_items').delete().eq('owner_id', userId),
    admin.from('notifications').delete().eq('user_id', userId),
    admin.from('privacy_preferences').delete().eq('user_id', userId),
    admin.from('newsletter_subscriptions').update({ unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId),
  ]);

  await admin.from('reviews').update({ comment: null }).eq('customer_id', userId);
  await admin.from('reviews').update({ trainer_reply: null, trainer_replied_at: null }).eq('trainer_id', userId);
  await admin.from('booking_messages').update({ body: '[Melding fjernet etter kontosletting.]' }).eq('sender_id', userId);
  await admin.from('bookings').update({ dog_id: null, dog_name: 'Slettet hund', customer_note: null }).eq('customer_id', userId);
  await admin.from('trainer_lesson_journals').update({ platform_customer_id: null, platform_dog_id: null, client_name_snapshot: 'Slettet kunde', dog_name_snapshot: 'Slettet hund', goals: null, private_notes: null }).eq('platform_customer_id', userId);
  await admin.from('lesson_shared_notes').update({ customer_id: null, shared_summary: null, homework: null, next_steps: null, published_at: null }).eq('customer_id', userId);
  await admin.from('group_enrollments').update({ dog_id: null, dog_name: 'Slettet hund', customer_note: null }).eq('customer_id', userId);
  await admin.from('group_waitlist').update({ dog_id: null, dog_name: 'Slettet hund', customer_note: null, status: 'withdrawn', updated_at: new Date().toISOString() }).eq('customer_id', userId).in('status', ['waiting','offered','checkout']);
  await admin.from('online_course_purchases').update({ dog_id: null, dog_name: null }).eq('customer_id', userId);
  await admin.from('moderation_reports').update({ details: null }).eq('reporter_id', userId);
  await admin.from('dogs').delete().eq('owner_id', userId);

  if (profile.role === 'trainer') {
    await Promise.all([
      removeFolder(admin, 'trainer-media', userId),
      removeFolder(admin, 'trainer-verification', userId),
    ]);
    await admin.from('lesson_shared_notes').delete().eq('trainer_id', userId);
    await admin.from('trainer_lesson_journals').delete().eq('trainer_id', userId);
    await admin.from('external_appointment_calendar_events').delete().eq('trainer_id', userId);
    await admin.from('external_appointments').delete().eq('trainer_id', userId);
    await admin.from('group_manual_participants').delete().eq('trainer_id', userId);
    await admin.from('trainer_client_dogs').delete().eq('trainer_id', userId);
    await admin.from('newsletter_subscriptions').update({ unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('trainer_id', userId);
    await admin.from('trainer_clients').delete().eq('trainer_id', userId);
    await admin.from('calendar_connections').delete().eq('trainer_id', userId);
    await admin.from('trainer_verification_submissions').delete().eq('trainer_id', userId);
    await admin.from('trainer_payout_profiles').update({ account_holder_name: null, bank_account_number: null, payout_ready: false }).eq('trainer_id', userId);
    await admin.from('services').update({ active: false }).eq('trainer_id', userId);
    await admin.from('group_offerings').update({ active: false }).eq('trainer_id', userId);
    await admin.from('online_courses').update({ published: false }).eq('trainer_id', userId);
    await admin.from('trainer_profiles').update({
      slug: `deleted-${userId.replace(/-/g, '').slice(0, 16)}`,
      business_name: 'Tidligere hundetrener',
      bio: null,
      city: '-',
      specialties: [],
      latitude: null,
      longitude: null,
      verified: false,
      verification_status: 'suspended',
      verification_review_note: 'Konto slettet av brukeren.',
      profile_image_url: null,
      cover_image_url: null,
      website_url: null,
      instagram_url: null,
      languages: [],
    }).eq('id', userId);
  }

  const now = new Date().toISOString();
  await admin.from('profiles').update({
    display_name: 'Slettet bruker',
    account_status: 'deleted',
    deleted_at: now,
    suspended_at: null,
    suspended_by: null,
    suspension_reason: null,
  }).eq('id', userId);
  await admin.from('account_deletion_requests').update({ status: 'completed', completed_at: now }).eq('user_id', userId);

  // Soft-delete auth identity so retained financial rows can keep the same UUID.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, true);
  if (deleteError) throw deleteError;
}
