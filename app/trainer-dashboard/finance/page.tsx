import { stripePayoutReady } from '@/lib/trainer-journey';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { savePayoutDetailsAction } from '@/app/trainer-dashboard/actions';

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }
function dateOnly(value?: string | null) { return value ? new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(value.includes('T') ? value : `${value}T12:00:00+02:00`)) : '-'; }

export default async function TrainerFinancePage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/finance');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'trainer') redirect('/');

  const [{ data: trainer }, { data: payout }, { data: control }, { data: ledger }, { data: statements }, { data: batches }, { data: stripeAccount }] = await Promise.all([
    supabase.from('trainer_profiles').select('business_name').eq('id', user.id).single(),
    supabase.from('trainer_payout_profiles').select('account_holder_name, bank_account_number, organisation_number, vat_registered, payout_ready').eq('trainer_id', user.id).maybeSingle(),
    supabase.from('trainer_payout_controls').select('payout_hold, hold_reason').eq('trainer_id', user.id).maybeSingle(),
    supabase.from('trainer_ledger').select('id, entry_type, description, gross_service_nok, platform_fee_nok, amount_nok, status, completed_at, scheduled_payout_date, paid_at').eq('trainer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('payout_statements').select('id, batch_id, statement_number, gross_service_nok, platform_fee_nok, adjustments_nok, payout_nok, paid_at, created_at').eq('trainer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('payout_batches').select('id, payout_date, period_start, period_end, status, bank_reference').order('payout_date', { ascending: false }),
    supabase.from('trainer_payment_accounts').select('stripe_account_id,details_submitted,payouts_enabled,transfers_active').eq('trainer_id', user.id).maybeSingle(),
  ]);
  if (!trainer) redirect('/trainer-onboarding');
  const batchMap = new Map((batches || []).map((b) => [b.id, b]));
  const pending = (ledger || []).filter((x) => ['eligible','batched'].includes(x.status)).reduce((s,x) => s + x.amount_nok, 0);
  const paid = (ledger || []).filter((x) => x.status === 'paid').reduce((s,x) => s + x.amount_nok, 0);
  const adjustments = (ledger || []).filter((x) => x.entry_type === 'adjustment').reduce((s,x) => s + x.amount_nok, 0);
  const nextDate = (ledger || []).filter((x) => x.status === 'eligible' && x.scheduled_payout_date).map((x) => String(x.scheduled_payout_date)).sort()[0];

  return <main className="dashboard">
    <section className="dashboard-heading"><div><span className="eyebrow">Økonomi</span><h1>Økonomi</h1><p className="muted">Opptjening, justeringer og utbetalingsoppgaver.</p></div><div className="dashboard-heading-actions"><Link className="btn secondary" href="/trainer-dashboard">Til dashbordet</Link></div></section>
    {message ? <p className="form-success dashboard-flash">{message}</p> : null}
    {error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}

    <section className="workspace-payment-status"><div><strong>{stripePayoutReady(stripeAccount) ? 'Stripe-kontoen er klar' : 'Stripe-oppsettet trenger oppfølging'}</strong><p className="muted small">Se kontostatus og eventuelle krav til utbetaling.</p></div><Link className="btn secondary compact" href="/trainer-dashboard/verification">Se betalingsoppsett</Link></section>
    {control?.payout_hold ? <section className="dashboard-section"><div className="notice"><strong>Utbetalingen din er midlertidig satt på hold.</strong><br />{control.hold_reason || 'Kontakt plattformen hvis du trenger mer informasjon.'} Opptjeningen forsvinner ikke og bæres videre.</div></section> : null}
    {!payout?.payout_ready ? <section className="dashboard-section"><div className="notice">Bankopplysninger for manuelle oppgjør mangler. Registrer disse nedenfor hvis Hundetimer skal utbetale et manuelt oppgjør.</div></section> : null}

    <details className="workspace-disclosure" open={!payout?.payout_ready}><summary>Bankopplysninger for oppgjør</summary><section className="dashboard-section trainer-finance-settings"><div className="section-title"><div><span className="eyebrow">Utbetalingskonto</span><h2>Bankopplysninger</h2><p className="muted">Disse opplysningene brukes til manuelle oppgjør fra Hundetimer den 10. og 25. De endrer ikke bankkontoen du har registrert hos Stripe.</p></div></div><form action={savePayoutDetailsAction} className="form-grid payout-details-form"><label>Kontoeier<input name="accountHolderName" required defaultValue={payout?.account_holder_name || ''} placeholder="Navn eller bedriftsnavn" /></label><label>Kontonummer<input name="bankAccountNumber" required inputMode="numeric" defaultValue={payout?.bank_account_number || ''} placeholder="11 siffer" /></label><label>Organisasjonsnummer<input name="organisationNumber" defaultValue={payout?.organisation_number || ''} placeholder="Valgfritt" /></label><label className="checkbox-label"><input type="checkbox" name="vatRegistered" defaultChecked={Boolean(payout?.vat_registered)} /> MVA-registrert</label><div className="full"><button className="btn" type="submit">Lagre bankopplysninger</button></div></form></section></details>

    <section className="stats-grid"><div className="stat-card"><span className="muted small">Til utbetaling</span><strong>{money(pending)}</strong>{nextDate ? <span className="muted small">Tidligst {dateOnly(nextDate)}</span> : null}</div><div className="stat-card"><span className="muted small">Totalt utbetalt</span><strong>{money(paid)}</strong></div><div className="stat-card"><span className="muted small">Netto justeringer</span><strong>{money(adjustments)}</strong></div></section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Utbetalingsoppgaver</span><h2>Oppgjør og dokumentasjon</h2></div></div>{(statements || []).length ? <div className="booking-list">{statements!.map((statement) => { const batch = batchMap.get(statement.batch_id); return <article className="booking-row" key={statement.id}><div className="booking-date"><strong>{statement.statement_number}</strong><span>{batch ? `${dateOnly(batch.period_start)} til ${dateOnly(batch.period_end)}` : 'Utbetalingsperiode'}</span></div><div><strong>{money(statement.payout_nok)}</strong><span className="muted small">{statement.paid_at ? `Betalt ${dateOnly(statement.paid_at)}` : batch?.payout_date ? `Planlagt ${dateOnly(batch.payout_date)}` : 'Klargjort'}</span></div><div className="booking-actions"><a className="btn secondary compact" href={`/payout-statements/${statement.id}`}>Last ned PDF</a></div></article>; })}</div> : <div className="empty-state compact-empty"><h3>Ingen utbetalingsoppgaver ennå</h3><p className="muted">Utbetalingsoppgaven vises her når oppgjøret ditt er klart.</p></div>}</section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Transaksjoner</span><h2>Alle økonomiposter</h2></div></div>{(ledger || []).length ? <div className="booking-list">{ledger!.map((entry) => <article className="booking-row payout-ledger-row" key={entry.id}><div className="booking-date"><strong>{entry.description}</strong><span>{entry.entry_type === 'adjustment' ? 'Manuell justering' : entry.completed_at ? `Opptjent ${dateOnly(entry.completed_at)}` : 'Opptjening'}</span></div><div><strong>{money(entry.amount_nok)}</strong>{entry.entry_type === 'earning' ? <span className="muted small">Brutto {money(entry.gross_service_nok)} · plattform {money(entry.platform_fee_nok)}</span> : null}</div><div><span className={`status ${entry.status}`}>{entry.status === 'paid' ? 'Utbetalt' : entry.status === 'batched' ? 'Klargjort' : entry.status === 'reversed' ? 'Reversert' : 'Til utbetaling'}</span></div></article>)}</div> : <div className="empty-state compact-empty"><h3>Ingen økonomiposter ennå</h3></div>}</section>
  </main>;
}
