import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/server';
import { bestEffortNotification } from '@/lib/notifications/server';

const BRAND = process.env.EMAIL_BRAND_NAME?.trim() || 'Hundetimer';
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

type BookingContext = {
  id: string;
  customerId: string;
  trainerId: string;
  customerEmail: string | null;
  trainerEmail: string | null;
  customerName: string;
  trainerName: string;
  serviceTitle: string;
  dogName: string;
  startsAt: string;
  subtotalNok: number;
  serviceFeeNok: number;
  totalNok: number;
  cancellationReason: string | null;
  refundAmountNok: number | null;
  refundStatus: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
}

function when(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(value);
}

function emailFrame(options: { eyebrow: string; title: string; intro: string; details?: Array<[string, string]>; body?: string; buttonLabel?: string; buttonUrl?: string; footnote?: string }) {
  const details = options.details?.length ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;background:#f7f5ef;border-radius:14px;padding:8px 18px">${options.details.map(([label, value]) => `<tr><td style="padding:10px 0;color:#6b6b67;font-size:14px">${escapeHtml(label)}</td><td style="padding:10px 0;text-align:right;color:#1d1d1b;font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`).join('')}</table>` : '';
  const button = options.buttonLabel && options.buttonUrl ? `<p style="margin:28px 0"><a href="${escapeHtml(options.buttonUrl)}" style="display:inline-block;background:#20251f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${escapeHtml(options.buttonLabel)}</a></p>` : '';
  return `<!doctype html><html lang="nb"><body style="margin:0;background:#f4f1e9;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:22px;padding:34px;box-shadow:0 1px 8px rgba(0,0,0,.05)"><p style="margin:0 0 12px;color:#78826f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(options.eyebrow)}</p><h1 style="font-size:28px;line-height:1.2;margin:0 0 16px">${escapeHtml(options.title)}</h1><p style="font-size:16px;line-height:1.6;margin:0;color:#484844">${escapeHtml(options.intro)}</p>${details}${options.body || ''}${button}${options.footnote ? `<p style="margin:24px 0 0;color:#777;font-size:13px;line-height:1.5">${escapeHtml(options.footnote)}</p>` : ''}</div><p style="text-align:center;color:#8a8a85;font-size:12px;margin:18px 0 0">${escapeHtml(BRAND)}</p></div></body></html>`;
}

async function getBookingContext(bookingId: string): Promise<BookingContext | null> {
  const admin = createAdminClient();
  const { data: booking, error } = await admin.from('bookings').select('id, customer_id, trainer_id, service_id, requested_starts_at, subtotal_nok, service_fee_nok, dog_name, cancellation_reason, refund_amount_nok, refund_status').eq('id', bookingId).maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const [{ data: customerProfile }, { data: trainerProfile }, { data: service }, customerAuth, trainerAuth] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', booking.customer_id).maybeSingle(),
    admin.from('trainer_profiles').select('business_name').eq('id', booking.trainer_id).maybeSingle(),
    admin.from('services').select('title').eq('id', booking.service_id).maybeSingle(),
    admin.auth.admin.getUserById(booking.customer_id),
    admin.auth.admin.getUserById(booking.trainer_id),
  ]);

  const subtotalNok = Number(booking.subtotal_nok || 0);
  const serviceFeeNok = Number(booking.service_fee_nok || 0);
  return {
    id: booking.id,
    customerId: booking.customer_id,
    trainerId: booking.trainer_id,
    customerEmail: customerAuth.data.user?.email || null,
    trainerEmail: trainerAuth.data.user?.email || null,
    customerName: customerProfile?.display_name || 'Kunde',
    trainerName: trainerProfile?.business_name || 'Hundetrener',
    serviceTitle: service?.title || 'Hundetrening',
    dogName: booking.dog_name || 'hunden',
    startsAt: booking.requested_starts_at,
    subtotalNok,
    serviceFeeNok,
    totalNok: subtotalNok + serviceFeeNok,
    cancellationReason: booking.cancellation_reason || null,
    refundAmountNok: booking.refund_amount_nok == null ? null : Number(booking.refund_amount_nok),
    refundStatus: booking.refund_status || null,
  };
}

async function bestEffort(task: () => Promise<unknown>, label: string) {
  try { await task(); } catch (error) { console.error(`[email] ${label}`, error); }
}

export async function notifyBookingRequested(bookingId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  const details: Array<[string, string]> = [['Tjeneste', ctx.serviceTitle], ['Hund', ctx.dogName], ['Tid', when(ctx.startsAt)], ['Beløp reservert', money(ctx.totalNok)]];
  await Promise.all([
    bestEffortNotification({ userId: ctx.trainerId, type: 'booking', title: `Ny bookingforespørsel: ${ctx.dogName}`, body: `${ctx.customerName} ønsker ${ctx.serviceTitle} ${when(ctx.startsAt)}.`, href: '/trainer-dashboard', eventKey: `booking-requested/trainer/${ctx.id}` }),
    bestEffortNotification({ userId: ctx.customerId, type: 'booking', title: 'Bookingforespørselen er sendt', body: `${ctx.trainerName} har opptil 24 timer på å svare.`, href: `/booking/${ctx.id}`, eventKey: `booking-requested/customer/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.trainerEmail, subject: `Ny bookingforespørsel: ${ctx.dogName}`, idempotencyKey: `booking-requested/trainer/${ctx.id}`, html: emailFrame({ eyebrow: 'Ny booking', title: `${ctx.customerName} ønsker en time`, intro: `Du har fått en ny bookingforespørsel for ${ctx.dogName}. Du har 24 timer på å bekrefte, foreslå en annen tid eller avslå.`, details, buttonLabel: 'Åpne trenerdashboard', buttonUrl: `${BASE_URL}/trainer-dashboard`, footnote: 'Kundens kort er kun reservert. Beløpet trekkes først når du bekrefter.' }) }), 'booking requested trainer'),
    bestEffort(() => sendTransactionalEmail({ to: ctx.customerEmail, subject: `Bookingforespørselen er sendt til ${ctx.trainerName}`, idempotencyKey: `booking-requested/customer/${ctx.id}`, html: emailFrame({ eyebrow: 'Booking sendt', title: 'Treneren har fått forespørselen din', intro: `${ctx.trainerName} har nå opptil 24 timer på å svare.`, details, buttonLabel: 'Se bestillingen', buttonUrl: `${BASE_URL}/booking/${ctx.id}`, footnote: 'Beløpet er foreløpig bare reservert på kortet ditt.' }) }), 'booking requested customer'),
  ]);
}

export async function notifyBookingConfirmed(bookingId: string, source: 'trainer' | 'instant' | 'reschedule' = 'trainer') {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  const suffix = source === 'instant' ? 'instant' : source === 'reschedule' ? 'reschedule' : 'trainer';
  await Promise.all([
    bestEffortNotification({ userId: ctx.customerId, type: 'booking', title: 'Timen din er bekreftet', body: `${ctx.trainerName} har bekreftet ${ctx.serviceTitle} for ${ctx.dogName}.`, href: `/booking/${ctx.id}`, eventKey: `booking-confirmed/${suffix}/customer/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.customerEmail, subject: `Timen hos ${ctx.trainerName} er bekreftet`, idempotencyKey: `booking-confirmed/${suffix}/customer/${ctx.id}`, html: emailFrame({ eyebrow: 'Bekreftet', title: 'Timen din er bekreftet', intro: `${ctx.trainerName} har bekreftet timen for ${ctx.dogName}.`, details: [['Tjeneste', ctx.serviceTitle], ['Tid', when(ctx.startsAt)], ['Betalt', money(ctx.totalNok)]], buttonLabel: 'Se bestillingen', buttonUrl: `${BASE_URL}/booking/${ctx.id}` }) }), 'booking confirmed customer'),
  ]);
}

export async function notifyBookingDeclined(bookingId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  await Promise.all([
    bestEffortNotification({ userId: ctx.customerId, type: 'booking', title: 'Bookingforespørselen ble avslått', body: `${ctx.trainerName} kunne ikke ta timen. Kortreservasjonen er frigitt.`, href: `/booking/${ctx.id}`, eventKey: `booking-declined/customer/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.customerEmail, subject: `${ctx.trainerName} kunne ikke ta bookingen`, idempotencyKey: `booking-declined/customer/${ctx.id}`, html: emailFrame({ eyebrow: 'Booking avslått', title: 'Kortreservasjonen er frigitt', intro: `${ctx.trainerName} kunne dessverre ikke ta timen du ønsket.`, details: [['Tjeneste', ctx.serviceTitle], ['Ønsket tid', when(ctx.startsAt)]], buttonLabel: 'Finn en annen trener eller tid', buttonUrl: `${BASE_URL}/browse`, footnote: 'Det reserverte beløpet er frigitt. Det kan ta litt tid før banken viser dette på kontoen din.' }) }), 'booking declined'),
  ]);
}

export async function notifyRescheduleOffered(bookingId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  const admin = createAdminClient();
  const { data: offer } = await admin.from('reschedule_offers').select('proposed_starts_at, note').eq('booking_id', bookingId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!offer) return;
  await Promise.all([
    bestEffortNotification({ userId: ctx.customerId, type: 'booking', title: 'Treneren foreslår en annen tid', body: `${ctx.trainerName} foreslår ${when(offer.proposed_starts_at)} for ${ctx.dogName}.`, href: `/booking/${ctx.id}`, eventKey: `reschedule-offered/customer/${ctx.id}/${offer.proposed_starts_at}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.customerEmail, subject: `${ctx.trainerName} foreslår en annen tid`, idempotencyKey: `reschedule-offered/customer/${ctx.id}/${offer.proposed_starts_at}`, html: emailFrame({ eyebrow: 'Nytt tidspunkt', title: 'Treneren foreslår en annen tid', intro: `${ctx.trainerName} kan ikke den opprinnelige tiden, men har foreslått et alternativ.`, details: [['Ny tid', when(offer.proposed_starts_at)], ['Hund', ctx.dogName]], body: offer.note ? `<p style="margin:18px 0 0;padding:14px 16px;background:#f7f5ef;border-radius:12px;color:#484844"><strong>Melding fra trener:</strong><br>${escapeHtml(offer.note)}</p>` : undefined, buttonLabel: 'Godta eller avslå', buttonUrl: `${BASE_URL}/booking/${ctx.id}`, footnote: 'Kortreservasjonen beholdes mens du vurderer den nye tiden.' }) }), 'reschedule offered'),
  ]);
}

export async function notifyRescheduleAccepted(bookingId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  await Promise.all([
    notifyBookingConfirmed(bookingId, 'reschedule'),
    bestEffortNotification({ userId: ctx.trainerId, type: 'booking', title: 'Kunden godtok nytt tidspunkt', body: `${ctx.customerName} godtok den nye tiden for ${ctx.dogName}.`, href: '/trainer-dashboard', eventKey: `reschedule-accepted/trainer/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.trainerEmail, subject: `${ctx.customerName} godtok det nye tidspunktet`, idempotencyKey: `reschedule-accepted/trainer/${ctx.id}`, html: emailFrame({ eyebrow: 'Nytt tidspunkt godtatt', title: 'Kunden har bekreftet den nye tiden', intro: `${ctx.customerName} har godtatt det nye tidspunktet for ${ctx.dogName}.`, details: [['Tjeneste', ctx.serviceTitle], ['Tid', when(ctx.startsAt)]], buttonLabel: 'Se bookinger', buttonUrl: `${BASE_URL}/trainer-dashboard` }) }), 'reschedule accepted trainer'),
  ]);
}

export async function notifyRescheduleDeclined(bookingId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  await Promise.all([
    bestEffortNotification({ userId: ctx.trainerId, type: 'booking', title: 'Kunden takket nei til ny tid', body: `Bookingen for ${ctx.dogName} er avsluttet.`, href: '/trainer-dashboard', eventKey: `reschedule-declined/trainer/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.trainerEmail, subject: `${ctx.customerName} takket nei til ny tid`, idempotencyKey: `reschedule-declined/trainer/${ctx.id}`, html: emailFrame({ eyebrow: 'Forslag avslått', title: 'Kunden takket nei til den nye tiden', intro: `Bookingen for ${ctx.dogName} er avsluttet og kortreservasjonen er frigitt.`, details: [['Tjeneste', ctx.serviceTitle]], buttonLabel: 'Åpne trenerdashboard', buttonUrl: `${BASE_URL}/trainer-dashboard` }) }), 'reschedule declined trainer'),
  ]);
}

export async function notifyBookingCancelled(bookingId: string, actor: 'customer' | 'trainer') {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  const refundText = ctx.refundStatus === 'succeeded' && ctx.refundAmountNok != null ? `${money(ctx.refundAmountNok)} er refundert.` : 'Eventuell kortreservasjon er frigitt eller refusjonen er startet.';
  const reason = ctx.cancellationReason ? ` Grunn: ${ctx.cancellationReason}` : '';
  const otherRecipient = actor === 'customer' ? ctx.trainerEmail : ctx.customerEmail;
  const actorRecipient = actor === 'customer' ? ctx.customerEmail : ctx.trainerEmail;
  const otherSubject = actor === 'customer' ? `${ctx.customerName} har avbestilt timen` : `${ctx.trainerName} har avbestilt timen`;
  const otherTitle = actor === 'customer' ? 'Kunden har avbestilt' : 'Treneren har avbestilt';

  const otherUserId = actor === 'customer' ? ctx.trainerId : ctx.customerId;
  const actorUserId = actor === 'customer' ? ctx.customerId : ctx.trainerId;
  await Promise.all([
    bestEffortNotification({ userId: otherUserId, type: 'booking', title: otherTitle, body: `${actor === 'customer' ? ctx.customerName : ctx.trainerName} har avbestilt timen for ${ctx.dogName}.`, href: actor === 'customer' ? '/trainer-dashboard' : `/booking/${ctx.id}`, eventKey: `booking-cancelled/${actor}/other/${ctx.id}` }),
    bestEffortNotification({ userId: actorUserId, type: 'booking', title: 'Avbestillingen er registrert', body: refundText, href: actor === 'customer' ? `/booking/${ctx.id}` : '/trainer-dashboard', eventKey: `booking-cancelled/${actor}/receipt/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({
      to: otherRecipient,
      subject: otherSubject,
      idempotencyKey: `booking-cancelled/${actor}/other/${ctx.id}`,
      html: emailFrame({
        eyebrow: 'Avbestilling',
        title: otherTitle,
        intro: `${actor === 'customer' ? ctx.customerName : ctx.trainerName} har avbestilt timen for ${ctx.dogName}.${reason}`,
        details: [['Tjeneste', ctx.serviceTitle], ['Tid', when(ctx.startsAt)]],
        body: actor === 'trainer' ? `<p style="margin:18px 0 0;color:#484844">${escapeHtml(refundText)}</p>` : undefined,
        buttonLabel: actor === 'customer' ? 'Åpne trenerdashboard' : 'Se bestillingen',
        buttonUrl: actor === 'customer' ? `${BASE_URL}/trainer-dashboard` : `${BASE_URL}/booking/${ctx.id}`,
      }),
    }), 'booking cancelled other party'),
    bestEffort(() => sendTransactionalEmail({
      to: actorRecipient,
      subject: 'Avbestillingen er registrert',
      idempotencyKey: `booking-cancelled/${actor}/receipt/${ctx.id}`,
      html: emailFrame({
        eyebrow: 'Avbestilling registrert',
        title: 'Bestillingen er avbestilt',
        intro: actor === 'customer' ? `Vi har registrert avbestillingen for ${ctx.dogName}.` : `Vi har registrert at du avbestilte timen for ${ctx.dogName}.`,
        details: [['Tjeneste', ctx.serviceTitle], ['Tid', when(ctx.startsAt)]],
        body: `<p style="margin:18px 0 0;color:#484844">${escapeHtml(refundText)}</p>`,
        buttonLabel: actor === 'customer' ? 'Se bestillingen' : 'Åpne trenerdashboard',
        buttonUrl: actor === 'customer' ? `${BASE_URL}/booking/${ctx.id}` : `${BASE_URL}/trainer-dashboard`,
      }),
    }), 'booking cancelled receipt'),
  ]);
}

export async function notifyBookingExpired(bookingId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  await Promise.all([
    bestEffortNotification({ userId: ctx.customerId, type: 'booking', title: 'Bookingforespørselen utløp', body: `${ctx.trainerName} svarte ikke innen 24 timer. Kortreservasjonen er frigitt.`, href: `/booking/${ctx.id}`, eventKey: `booking-expired/customer/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.customerEmail, subject: `Bookingforespørselen hos ${ctx.trainerName} utløp`, idempotencyKey: `booking-expired/customer/${ctx.id}`, html: emailFrame({ eyebrow: 'Forespørselen utløp', title: 'Treneren svarte ikke innen 24 timer', intro: `Bookingen for ${ctx.dogName} er avsluttet, og kortreservasjonen er frigitt.`, details: [['Tjeneste', ctx.serviceTitle], ['Ønsket tid', when(ctx.startsAt)]], buttonLabel: 'Finn en annen tid', buttonUrl: `${BASE_URL}/browse` }) }), 'booking expired'),
  ]);
}

export async function notifyRefundSucceeded(bookingId: string, refundId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  const amount = ctx.refundAmountNok == null ? ctx.totalNok : ctx.refundAmountNok;
  await Promise.all([
    bestEffortNotification({ userId: ctx.customerId, type: 'refund', title: 'Refusjonen er registrert', body: `${money(amount)} er refundert for ${ctx.serviceTitle}.`, href: `/booking/${ctx.id}`, eventKey: `refund-succeeded/customer/${ctx.id}/${refundId}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.customerEmail, subject: `Refusjon på ${money(amount)} er registrert`, idempotencyKey: `refund-succeeded/customer/${ctx.id}/${refundId}`, html: emailFrame({ eyebrow: 'Refusjon', title: 'Refusjonen er registrert', intro: `Vi har refundert betalingen for ${ctx.serviceTitle}.`, details: [['Beløp', money(amount)], ['Hund', ctx.dogName]], buttonLabel: 'Se bestillingen', buttonUrl: `${BASE_URL}/booking/${ctx.id}`, footnote: 'Hvor raskt beløpet vises på kontoen avhenger av banken og kortutstederen din.' }) }), 'refund succeeded'),
  ]);
}

export async function notifyBookingCompleted(bookingId: string) {
  const ctx = await getBookingContext(bookingId); if (!ctx) return;
  await Promise.all([
    bestEffortNotification({ userId: ctx.customerId, type: 'review', title: 'Hvordan var timen?', body: `Timen for ${ctx.dogName} er fullført. Du kan nå gi ${ctx.trainerName} en vurdering.`, href: `/booking/${ctx.id}`, eventKey: `booking-completed/customer/${ctx.id}` }),
    bestEffort(() => sendTransactionalEmail({ to: ctx.customerEmail, subject: `Takk for timen hos ${ctx.trainerName}`, idempotencyKey: `booking-completed/customer/${ctx.id}`, html: emailFrame({ eyebrow: 'Time fullført', title: 'Takk for bookingen', intro: `Timen for ${ctx.dogName} er markert som fullført.`, details: [['Tjeneste', ctx.serviceTitle], ['Trener', ctx.trainerName]], buttonLabel: 'Gi en vurdering', buttonUrl: `${BASE_URL}/booking/${ctx.id}` }) }), 'booking completed customer'),
  ]);
}
