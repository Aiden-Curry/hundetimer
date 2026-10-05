import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { allExportRows, downloadHeaders } from '@/lib/exports';

export const dynamic = 'force-dynamic';
type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, any>;

function checked<T>(result: { data: T; error?: unknown }): T {
  if (result.error) throw new Error('Eksporten kunne ikke fullføres.');
  return result.data;
}
function rows(admin: Admin, table: string, column: string, value: string) {
  const key = table === 'privacy_preferences' ? 'user_id' : 'id';
  return allExportRows<Row>((from, to) => admin.from(table).select('*').eq(column, value).order(key).range(from, to));
}
async function related(admin: Admin, table: string, column: string, ids: string[]) {
  const result: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    result.push(...await allExportRows<Row>((from, to) => {
      let query = admin.from(table).select('*').in(column, chunk);
      query = table === 'online_course_progress' ? query.order('purchase_id').order('lesson_id') : query.order(table === 'online_course_lesson_content' ? 'lesson_id' : 'id');
      return query.range(from, to);
    }));
  }
  return result;
}
function exportReplacer(key: string, value: unknown) {
  return /^(unsubscribe_token|encrypted_refresh_token|refresh_token|access_token|.*client_secret)$/i.test(key) ? undefined : value;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/account/privacy', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));
  try {
    const admin = createAdminClient();
    const profile = checked(await admin.from('profiles').select('*').eq('id', user.id).maybeSingle());
    const [privacy, deletion, dogs, bookings, groupEnrollments, waitlist, purchases, reviews, saved, notifications, reports, subscriptions, trainerProfile] = await Promise.all([
      rows(admin, 'privacy_preferences', 'user_id', user.id),
      rows(admin, 'account_deletion_requests', 'user_id', user.id),
      rows(admin, 'dogs', 'owner_id', user.id),
      allExportRows<Row>((from, to) => admin.from('bookings').select('*').or(`customer_id.eq.${user.id},trainer_id.eq.${user.id}`).order('id').range(from, to)),
      rows(admin, 'group_enrollments', 'customer_id', user.id),
      rows(admin, 'group_waitlist', 'customer_id', user.id),
      rows(admin, 'online_course_purchases', 'customer_id', user.id),
      allExportRows<Row>((from, to) => admin.from('reviews').select('*').or(`customer_id.eq.${user.id},trainer_id.eq.${user.id}`).order('id').range(from, to)),
      rows(admin, 'saved_items', 'owner_id', user.id),
      rows(admin, 'notifications', 'user_id', user.id),
      rows(admin, 'moderation_reports', 'reporter_id', user.id),
      rows(admin, 'newsletter_subscriptions', 'user_id', user.id),
      admin.from('trainer_profiles').select('*').eq('id', user.id).maybeSingle().then(checked),
    ]);
    const [messages, bookingEvents, reschedules, progress, sharedLessonNotes] = await Promise.all([
      related(admin, 'booking_messages', 'booking_id', bookings.map(b => b.id)),
      related(admin, 'booking_events', 'booking_id', bookings.map(b => b.id)),
      related(admin, 'reschedule_offers', 'booking_id', bookings.map(b => b.id)),
      related(admin, 'online_course_progress', 'purchase_id', purchases.map(p => p.id)),
      allExportRows<Row>((from, to) => admin.from('lesson_shared_notes').select('*').eq('customer_id', user.id).not('published_at', 'is', null).order('id').range(from, to)),
    ]);
    const trainer: Record<string, unknown> = {};
    if (trainerProfile) {
      trainer.profile = trainerProfile;
      const collections = [
        ['services', 'services'], ['weekly_availability', 'weekly_availability'], ['availability_exceptions', 'availability_exceptions'],
        ['activities', 'group_offerings'], ['online_courses', 'online_courses'], ['promotions', 'promotions'],
        ['ledger', 'trainer_ledger'], ['payout_statements', 'payout_statements'], ['verification_submissions', 'trainer_verification_submissions'],
        ['verification_documents', 'trainer_verification_documents'], ['trainer_agreement_acceptances', 'trainer_agreement_acceptances'],
        ['external_clients', 'trainer_clients'], ['external_client_dogs', 'trainer_client_dogs'], ['external_appointments', 'external_appointments'],
        ['manual_group_participants', 'group_manual_participants'], ['lesson_journals', 'trainer_lesson_journals'], ['lesson_shared_notes', 'lesson_shared_notes'],
        ['newsletter_campaigns', 'newsletter_campaigns'], ['newsletter_subscriptions', 'newsletter_subscriptions'],
      ];
      await Promise.all(collections.map(async ([key, table]) => { trainer[key] = await rows(admin, table, 'trainer_id', user.id); }));
      const [payoutProfile, calendar, paymentAccount] = await Promise.all([
        admin.from('trainer_payout_profiles').select('*').eq('trainer_id', user.id).maybeSingle(),
        admin.from('calendar_connections').select('trainer_id,provider,account_email,calendar_id,sync_busy,sync_bookings,connected_at,last_busy_sync_at,last_error,updated_at').eq('trainer_id', user.id).maybeSingle(),
        admin.from('trainer_payment_accounts').select('trainer_id,stripe_account_id,details_submitted,payouts_enabled,transfers_active').eq('trainer_id', user.id).maybeSingle(),
      ]);
      trainer.payout_profile = checked(payoutProfile);
      trainer.calendar_connection = checked(calendar);
      trainer.payment_account = checked(paymentAccount);
      const courseIds = (trainer.online_courses as Row[]).map(c => c.id);
      const activityIds = (trainer.activities as Row[]).map(a => a.id);
      const [modules, lessons, contents, sessions] = await Promise.all([
        related(admin, 'online_course_modules', 'course_id', courseIds), related(admin, 'online_course_lessons', 'course_id', courseIds),
        related(admin, 'online_course_lesson_content', 'course_id', courseIds),
        related(admin, 'group_sessions', 'offering_id', activityIds),
      ]);
      Object.assign(trainer, { course_modules: modules, course_lessons: lessons, course_contents: contents, group_sessions: sessions });
    }
    const payload = {
      format_version: 2,
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at, profile },
      privacy_preferences: privacy, deletion_requests: deletion, dogs, bookings, booking_events: bookingEvents,
      reschedule_offers: reschedules, booking_messages: messages, shared_lesson_notes: sharedLessonNotes,
      group_enrollments: groupEnrollments, waitlist, online_course_purchases: purchases, online_course_progress: progress,
      reviews, saved_items: saved, notifications, reports_submitted: reports, newsletter_subscriptions: subscriptions,
      trainer: trainerProfile ? trainer : undefined,
      note: 'Eksporten inneholder kontodata og lagrede opplysninger knyttet til kontoen. Filreferanser er inkludert, men ikke selve vedleggene. Tilgangsnøkler og kortdata hos Stripe er ikke inkludert. Kundedelen inneholder bare journalnotater som er delt med deg.',
    };
    return new NextResponse(JSON.stringify(payload, exportReplacer, 2), { headers: downloadHeaders('application/json; charset=utf-8', `hundetimer-data-${new Date().toISOString().slice(0, 10)}.json`) });
  } catch {
    return NextResponse.json({ error: 'Dataeksporten kunne ikke fullføres. Ingen delvis eksport er lastet ned. Prøv igjen senere.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
