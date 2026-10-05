import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe/server';

function money(value: number) {
  return new Intl.NumberFormat('nb-NO').format(value) + ' kr';
}
function monthLabel(month: string) {
  return new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(`${month}-15T12:00:00Z`));
}
function osloMidnight(year: number, month: number, day: number) {
  const probe = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', timeZoneName: 'longOffset' }).formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value || 'GMT+01:00';
  const offset = tz.replace('GMT', '');
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00${offset}`;
}
function monthRange(month: string) {
  const [y,m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return { start: osloMidnight(y,m,1), end: osloMidnight(nextY,nextM,1) };
}

type PaymentRow = { subtotal_nok: number; service_fee_nok: number; platform_fee_nok: number; stripe_payment_intent_id?: string | null; };

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const defaultMonth = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date()).slice(0,7);
  const month = /^\d{4}-\d{2}$/.test(params.month || '') ? String(params.month) : defaultMonth;
  const { start, end } = monthRange(month);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/admin/finance?month=${month}`);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/');

  const db = createAdminClient();

  const [
    { data: bookings }, { data: bookingRefunds },
    { data: groups }, { data: groupRefunds },
    { data: courses }, { data: courseRefunds },
    { data: ledger }, { data: paidLedger }, { data: batches },
  ] = await Promise.all([
    db.from('bookings').select('subtotal_nok, service_fee_nok, platform_fee_nok, stripe_payment_intent_id, payment_captured_at').gte('payment_captured_at', start).lt('payment_captured_at', end).in('payment_status', ['captured','refunded']),
    db.from('bookings').select('subtotal_nok, service_fee_nok, platform_fee_nok, stripe_payment_intent_id, refunded_at').gte('refunded_at', start).lt('refunded_at', end).eq('payment_status','refunded'),
    db.from('group_enrollments').select('subtotal_nok, service_fee_nok, platform_fee_nok, stripe_payment_intent_id, paid_at').gte('paid_at', start).lt('paid_at', end).in('payment_status',['captured','refunded']),
    db.from('group_enrollments').select('subtotal_nok, service_fee_nok, platform_fee_nok, stripe_payment_intent_id, refunded_at').gte('refunded_at', start).lt('refunded_at', end).eq('payment_status','refunded'),
    db.from('online_course_purchases').select('subtotal_nok, service_fee_nok, platform_fee_nok, stripe_payment_intent_id, purchased_at').gte('purchased_at', start).lt('purchased_at', end).in('payment_status',['captured','refunded']),
    db.from('online_course_purchases').select('subtotal_nok, service_fee_nok, platform_fee_nok, stripe_payment_intent_id, refunded_at').gte('refunded_at', start).lt('refunded_at', end).eq('payment_status','refunded'),
    db.from('trainer_ledger').select('amount_nok, platform_fee_nok, entry_type, completed_at').gte('completed_at', start).lt('completed_at', end),
    db.from('trainer_ledger').select('amount_nok, paid_at').gte('paid_at', start).lt('paid_at', end).eq('status','paid'),
    db.from('payout_batches').select('id, payout_date, total_nok, trainer_count, status').gte('payout_date', month + '-01').lt('payout_date', end.slice(0,10)).order('payout_date'),
  ]);

  const captured = [...(bookings || []), ...(groups || []), ...(courses || [])] as PaymentRow[];
  const refunded = [...(bookingRefunds || []), ...(groupRefunds || []), ...(courseRefunds || [])] as PaymentRow[];
  const grossCustomer = captured.reduce((sum,x) => sum + x.subtotal_nok + x.service_fee_nok, 0);
  const refundTotal = refunded.reduce((sum,x) => sum + x.subtotal_nok + x.service_fee_nok, 0);
  const serviceFees = captured.reduce((sum,x) => sum + x.service_fee_nok, 0) - refunded.reduce((sum,x) => sum + x.service_fee_nok, 0);
  const commissions = captured.reduce((sum,x) => sum + x.platform_fee_nok, 0) - refunded.reduce((sum,x) => sum + x.platform_fee_nok, 0);
  const expectedTrainerShare = captured.reduce((sum,x) => sum + Math.max(0, x.subtotal_nok - x.platform_fee_nok), 0) - refunded.reduce((sum,x) => sum + Math.max(0, x.subtotal_nok - x.platform_fee_nok), 0);
  const ledgerEarned = (ledger || []).filter((x) => x.entry_type === 'earning').reduce((sum,x) => sum + Number(x.amount_nok || 0), 0);
  const ledgerAdjustments = (ledger || []).filter((x) => x.entry_type === 'adjustment').reduce((sum,x) => sum + Number(x.amount_nok || 0), 0);
  const paidToTrainers = (paidLedger || []).reduce((sum,x) => sum + Number(x.amount_nok || 0), 0);
  const missingPaymentIds = captured.filter((x) => !x.stripe_payment_intent_id).length;

  let stripeGross = 0;
  let stripeFees = 0;
  let stripeNet = 0;
  let stripeAvailable = false;
  if (isStripeConfigured()) {
    try {
      const stripe = getStripe();
      const created = { gte: Math.floor(new Date(start).getTime() / 1000), lt: Math.floor(new Date(end).getTime() / 1000) };
      for await (const tx of stripe.balanceTransactions.list({ created, limit: 100 })) {
        if (!['charge','refund','payment'].includes(tx.type)) continue;
        stripeGross += tx.amount;
        stripeFees += tx.fee;
        stripeNet += tx.net;
      }
      stripeGross = Math.round(stripeGross / 100);
      stripeFees = Math.round(stripeFees / 100);
      stripeNet = Math.round(stripeNet / 100);
      stripeAvailable = true;
    } catch {
      stripeAvailable = false;
    }
  }

  const privateGross = (bookings || []).reduce((s,x) => s + x.subtotal_nok + x.service_fee_nok, 0);
  const groupGross = (groups || []).reduce((s,x) => s + x.subtotal_nok + x.service_fee_nok, 0);
  const onlineGross = (courses || []).reduce((s,x) => s + x.subtotal_nok + x.service_fee_nok, 0);

  return <main className="dashboard">
    <section className="dashboard-heading"><div><span className="eyebrow">Admin</span><h1>Økonomi og avstemming</h1><p className="muted">Månedsoversikt før Stripe-gebyrer, skatt og eventuell MVA-behandling.</p></div><div className="dashboard-heading-actions"><Link className="btn secondary" href="/admin/payouts">Utbetalinger</Link><Link className="btn secondary" href="/admin/trainers">Trenere</Link></div></section>

    <section className="dashboard-section"><form className="finance-month-form" method="get"><label>Måned<input type="month" name="month" defaultValue={month} /></label><button className="btn secondary compact" type="submit">Vis måned</button></form><p className="muted small">Viser {monthLabel(month)}.</p></section>

    <section className="stats-grid finance-stats">
      <div className="stat-card"><span className="muted small">Kundebetalinger fanget</span><strong>{money(grossCustomer)}</strong><span className="muted small">{captured.length} betalinger</span></div>
      <div className="stat-card"><span className="muted small">Refundert denne måneden</span><strong>{money(refundTotal)}</strong><span className="muted small">{refunded.length} refusjoner</span></div>
      <div className="stat-card"><span className="muted small">Plattforminntekt brutto</span><strong>{money(serviceFees + commissions)}</strong><span className="muted small">før Stripe-kostnader</span></div>
      <div className="stat-card"><span className="muted small">Forventet trenerandel</span><strong>{money(expectedTrainerShare)}</strong><span className="muted small">fra betalinger i perioden</span></div>
      <div className="stat-card"><span className="muted small">Opptjent i trainer ledger</span><strong>{money(ledgerEarned)}</strong><span className="muted small">fullført/solgt i perioden · justeringer {money(ledgerAdjustments)}</span></div>
      <div className="stat-card"><span className="muted small">Faktisk utbetalt</span><strong>{money(paidToTrainers)}</strong><span className="muted small">bankutbetalinger i perioden</span></div>
    </section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Salgsmiks</span><h2>Hvor kundebetalingen kommer fra</h2></div></div><div className="payout-breakdown"><div className="payout-breakdown-row"><div><strong>Privattimer</strong><span>{(bookings || []).length} betalinger</span></div><strong>{money(privateGross)}</strong></div><div className="payout-breakdown-row"><div><strong>Kurs og arrangementer</strong><span>{(groups || []).length} betalinger</span></div><strong>{money(groupGross)}</strong></div><div className="payout-breakdown-row"><div><strong>Nettkurs</strong><span>{(courses || []).length} betalinger</span></div><strong>{money(onlineGross)}</strong></div></div></section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Plattform</span><h2>Gebyrer og margin</h2></div></div><div className="payout-breakdown"><div className="payout-breakdown-row"><div><strong>Kundeservicegebyrer netto</strong></div><strong>{money(serviceFees)}</strong></div><div className="payout-breakdown-row"><div><strong>Plattformandel netto</strong></div><strong>{money(commissions)}</strong></div><div className="payout-breakdown-row"><div><strong>Brutto plattforminntekt</strong><span>Stripe-gebyrer er ikke trukket fra</span></div><strong>{money(serviceFees + commissions)}</strong></div><div className="payout-breakdown-row"><div><strong>Netto kontantbevegelse fra kunder</strong><span>fanget minus refusjoner</span></div><strong>{money(grossCustomer - refundTotal)}</strong></div></div></section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Stripe-avstemming</span><h2>Betalingskonto</h2><p className="muted">Stripe-tallene er faktiske balansebevegelser i perioden og kan også inneholde andre transaksjoner hvis Stripe-kontoen brukes til noe annet.</p></div></div>{stripeAvailable ? <div className="payout-breakdown"><div className="payout-breakdown-row"><div><strong>Stripe brutto bevegelser</strong></div><strong>{money(stripeGross)}</strong></div><div className="payout-breakdown-row"><div><strong>Stripe-gebyrer</strong></div><strong>{money(stripeFees)}</strong></div><div className="payout-breakdown-row"><div><strong>Stripe netto</strong></div><strong>{money(stripeNet)}</strong></div><div className="payout-breakdown-row"><div><strong>Database netto kundekontant</strong><span>fanget minus registrerte refusjoner</span></div><strong>{money(grossCustomer - refundTotal)}</strong></div></div> : <div className="notice">Stripe-avstemming er ikke tilgjengelig. Kontroller STRIPE_SECRET_KEY eller Stripe-tilkoblingen.</div>}</section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Avstemming</span><h2>Kontrollpunkter</h2></div></div><div className="payout-breakdown"><div className="payout-breakdown-row"><div><strong>Betalinger uten PaymentIntent-ID</strong><span>Bør normalt være 0</span></div><strong>{missingPaymentIds}</strong></div><div className="payout-breakdown-row"><div><strong>Trenerandel ennå ikke opptjent i ledger</strong><span>Kan være fremtidige private timer eller kurs som ikke er fullført ennå</span></div><strong>{money(expectedTrainerShare - ledgerEarned)}</strong></div></div></section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Utbetalingsbatcher</span><h2>{monthLabel(month)}</h2></div></div>{(batches || []).length ? <div className="booking-list">{batches!.map((batch) => <article className="booking-row" key={batch.id}><div className="booking-date"><strong>{batch.payout_date}</strong><span>{batch.trainer_count} trenere</span></div><strong>{money(batch.total_nok)}</strong><span className={`status ${batch.status}`}>{batch.status === 'paid' ? 'Betalt' : 'Klargjort'}</span><Link className="text-link" href="/admin/payouts">Åpne</Link></article>)}</div> : <div className="empty-state compact-empty"><h3>Ingen batcher denne måneden</h3></div>}</section>
  </main>;
}
