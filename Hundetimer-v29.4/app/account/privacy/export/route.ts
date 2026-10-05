import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function rows(admin: ReturnType<typeof createAdminClient>, table: string, column: string, value: string) {
  const { data, error } = await admin.from(table).select('*').eq(column, value);
  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/account/privacy', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const role = profile?.role;

  const [privacy, deletion, dogs, bookings, groupEnrollments, waitlist, purchases, reviews, saved, notifications, reports, newsletterSubscriptions] = await Promise.all([
    rows(admin,'privacy_preferences','user_id',user.id), rows(admin,'account_deletion_requests','user_id',user.id), rows(admin,'dogs','owner_id',user.id),
    admin.from('bookings').select('*').or(`customer_id.eq.${user.id},trainer_id.eq.${user.id}`), rows(admin,'group_enrollments','customer_id',user.id), rows(admin,'group_waitlist','customer_id',user.id),
    rows(admin,'online_course_purchases','customer_id',user.id), admin.from('reviews').select('*').or(`customer_id.eq.${user.id},trainer_id.eq.${user.id}`), rows(admin,'saved_items','owner_id',user.id), rows(admin,'notifications','user_id',user.id), rows(admin,'moderation_reports','reporter_id',user.id), rows(admin,'newsletter_subscriptions','user_id',user.id),
  ]);
  const bookingIds = (bookings.data || []).map((b:any)=>b.id);
  const purchaseIds = (purchases.data || []).map((p:any)=>p.id);
  const [messages, bookingEvents, reschedules, progress, sharedLessonNotes] = await Promise.all([
    bookingIds.length ? admin.from('booking_messages').select('*').in('booking_id', bookingIds) : Promise.resolve({data:[]}),
    bookingIds.length ? admin.from('booking_events').select('*').in('booking_id', bookingIds) : Promise.resolve({data:[]}),
    bookingIds.length ? admin.from('reschedule_offers').select('*').in('booking_id', bookingIds) : Promise.resolve({data:[]}),
    purchaseIds.length ? admin.from('online_course_progress').select('*').in('purchase_id', purchaseIds) : Promise.resolve({data:[]}),
    admin.from('lesson_shared_notes').select('*').eq('customer_id', user.id),
  ]);

  const trainer: Record<string, unknown> = {};
  if (role === 'trainer') {
    const [tp, services, availability, exceptions, activities, courses, promos, payoutProfile, ledger, statements, calendar, verifications, agreementAcceptances, trainerClients, trainerClientDogs, externalAppointments, manualParticipants, lessonJournals, trainerSharedNotes, newsletterCampaigns, newsletterSubs] = await Promise.all([
      admin.from('trainer_profiles').select('*').eq('id',user.id).maybeSingle(), rows(admin,'services','trainer_id',user.id), rows(admin,'weekly_availability','trainer_id',user.id), rows(admin,'availability_exceptions','trainer_id',user.id), rows(admin,'group_offerings','trainer_id',user.id), rows(admin,'online_courses','trainer_id',user.id), rows(admin,'promotions','trainer_id',user.id), admin.from('trainer_payout_profiles').select('*').eq('trainer_id',user.id).maybeSingle(), rows(admin,'trainer_ledger','trainer_id',user.id), rows(admin,'payout_statements','trainer_id',user.id), admin.from('calendar_connections').select('trainer_id,provider,account_email,calendar_id,sync_busy,sync_bookings,connected_at,last_busy_sync_at,last_error,updated_at').eq('trainer_id',user.id).maybeSingle(), rows(admin,'trainer_verification_submissions','trainer_id',user.id), rows(admin,'trainer_agreement_acceptances','trainer_id',user.id), rows(admin,'trainer_clients','trainer_id',user.id), rows(admin,'trainer_client_dogs','trainer_id',user.id), rows(admin,'external_appointments','trainer_id',user.id), rows(admin,'group_manual_participants','trainer_id',user.id), rows(admin,'trainer_lesson_journals','trainer_id',user.id), rows(admin,'lesson_shared_notes','trainer_id',user.id), rows(admin,'newsletter_campaigns','trainer_id',user.id), rows(admin,'newsletter_subscriptions','trainer_id',user.id),
    ]);
    Object.assign(trainer,{ profile:tp.data, services:services.data, weekly_availability:availability.data, availability_exceptions:exceptions.data, activities:activities.data, online_courses:courses.data, promotions:promos.data, payout_profile:payoutProfile.data, ledger:ledger.data, payout_statements:statements.data, calendar_connection:calendar.data, verification_submissions:verifications.data, trainer_agreement_acceptances:agreementAcceptances.data, external_clients:trainerClients.data, external_client_dogs:trainerClientDogs.data, external_appointments:externalAppointments.data, manual_group_participants:manualParticipants.data, lesson_journals:lessonJournals.data, lesson_shared_notes:trainerSharedNotes.data, newsletter_campaigns:newsletterCampaigns.data, newsletter_subscriptions:newsletterSubs.data });
  }

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id:user.id, email:user.email, created_at:user.created_at, last_sign_in_at:user.last_sign_in_at, profile },
    privacy_preferences: privacy.data,
    deletion_requests: deletion.data,
    dogs: dogs.data,
    bookings: bookings.data || [], booking_events: bookingEvents.data || [], reschedule_offers: reschedules.data || [], booking_messages: messages.data || [], shared_lesson_notes: sharedLessonNotes.data || [],
    group_enrollments: groupEnrollments.data, waitlist: waitlist.data,
    online_course_purchases: purchases.data, online_course_progress: progress.data || [],
    reviews: reviews.data || [], saved_items:saved.data, notifications:notifications.data, reports_submitted:reports.data, newsletter_subscriptions:newsletterSubscriptions.data,
    trainer: role === 'trainer' ? trainer : undefined,
    note: 'Kortdata og fullstendige betalingsinstrumenter lagres hos Stripe og inngår ikke i denne eksporten.'
  };
  const stamp = new Date().toISOString().slice(0,10);
  return new NextResponse(JSON.stringify(payload,null,2), { headers:{ 'Content-Type':'application/json; charset=utf-8', 'Content-Disposition':`attachment; filename="hundetimer-data-${stamp}.json"`, 'Cache-Control':'no-store' } });
}
