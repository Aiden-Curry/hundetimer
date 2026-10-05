import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  createPayoutBatchAction,
  markPayoutBatchPaidAction,
  runExpiryCheckAction,
  sendTestEmailAction,
  setPayoutHoldAction,
  createTrainerAdjustmentAction,
} from './actions';

function money(value: number) {
  return new Intl.NumberFormat('nb-NO').format(value) + ' kr';
}
function dateOnly(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(`${value}T12:00:00+02:00`));
}
function maskAccount(value?: string | null) {
  if (!value) return 'Mangler kontonummer';
  return `•••• •• ${value.slice(-5)}`;
}

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/payouts');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/');

  const [
    { data: ledger }, { data: batches }, { data: trainers }, { data: payoutProfiles },
    { data: items }, { data: statements }, { data: controls },
  ] = await Promise.all([
    supabase.from('trainer_ledger').select('id, trainer_id, amount_nok, status, scheduled_payout_date, payout_batch_id, description, entry_type').order('scheduled_payout_date'),
    supabase.from('payout_batches').select('id, payout_date, period_start, period_end, status, total_nok, trainer_count, paid_at, bank_reference, exported_at').order('payout_date', { ascending: false }),
    supabase.from('trainer_profiles').select('id, business_name').order('business_name'),
    supabase.from('trainer_payout_profiles').select('trainer_id, account_holder_name, bank_account_number, organisation_number, vat_registered, payout_ready'),
    supabase.from('payout_items').select('batch_id, trainer_id, ledger_entry_id, amount_nok'),
    supabase.from('payout_statements').select('id, batch_id, trainer_id, statement_number, gross_service_nok, platform_fee_nok, adjustments_nok, payout_nok, paid_at'),
    supabase.from('trainer_payout_controls').select('trainer_id, payout_hold, hold_reason, admin_note'),
  ]);

  const trainerMap = new Map((trainers || []).map((trainer) => [trainer.id, trainer.business_name]));
  const payoutMap = new Map((payoutProfiles || []).map((payout) => [payout.trainer_id, payout]));
  const controlMap = new Map((controls || []).map((control) => [control.trainer_id, control]));
  const dueEntries = (ledger || []).filter((entry) => entry.status === 'eligible' && entry.scheduled_payout_date);
  const dueDates = [...new Set(dueEntries.map((entry) => String(entry.scheduled_payout_date)))].sort();

  return <main className="dashboard">
    <section className="dashboard-heading">
      <div><span className="eyebrow">Admin</span><h1>Utbetalinger til trenere</h1><p className="muted">Batcher på 10. og 25., bankeksport, justeringer og utbetalingsoppgaver.</p>{message ? <p className="form-success dashboard-flash">{message}</p> : null}{error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}</div>
      <div className="dashboard-heading-actions"><Link className="btn secondary" href="/admin/finance">Økonomi</Link><Link className="btn secondary" href="/admin/trainers">Trenerverifisering</Link></div>
    </section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Kontroller</span><h2>Driftsverktøy</h2></div></div><div className="booking-actions-inline"><form action={runExpiryCheckAction}><button className="btn secondary" type="submit">Kjør utløpskontroll</button></form><form action={sendTestEmailAction}><button className="btn secondary" type="submit">Send testmail</button></form></div></section>

    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">Justeringer</span><h2>Legg til kredit eller trekk</h2><p className="muted">Bruk negative beløp for trekk. Negative saldoer bæres videre til senere utbetalinger.</p></div></div>
      <form action={createTrainerAdjustmentAction} className="form-grid finance-adjustment-form">
        <label>Trener<select name="trainerId" required defaultValue=""><option value="" disabled>Velg trener</option>{(trainers || []).map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.business_name}</option>)}</select></label>
        <label>Beløp i kr<input name="amountNok" type="number" step="1" required placeholder="-500 eller 250" /></label>
        <label>Utbetalingsdato<input name="payoutDate" type="date" /></label>
        <label className="full">Beskrivelse<input name="description" required maxLength={250} placeholder="F.eks. manuell korreksjon etter refusjon" /></label>
        <div className="full"><button className="btn secondary" type="submit">Opprett justering</button></div>
      </form>
    </section>

    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">Trenerkontroll</span><h2>Utbetalingshold</h2><p className="muted">En trener på hold beholder opptjeningen, men blir ikke med i en ny bankbatch.</p></div></div>
      <div className="booking-list">{(trainers || []).map((trainer) => {
        const payout = payoutMap.get(trainer.id);
        const control = controlMap.get(trainer.id);
        const isHeld = Boolean(control?.payout_hold);
        const balance = dueEntries.filter((e) => e.trainer_id === trainer.id).reduce((s,e) => s + e.amount_nok, 0);
        return <article className="booking-row payout-control-row" key={trainer.id}>
          <div className="booking-date"><strong>{trainer.business_name}</strong><span>{payout?.payout_ready ? `${maskAccount(payout.bank_account_number)} · ${payout.vat_registered ? 'MVA' : 'Ikke MVA'}` : 'Bankopplysninger mangler'}{isHeld ? ` · HOLD: ${control?.hold_reason || 'Ingen grunn oppgitt'}` : ''}</span></div>
          <strong>{money(balance)}</strong>
          <form action={setPayoutHoldAction} className="booking-actions-inline"><input type="hidden" name="trainerId" value={trainer.id} /><input type="hidden" name="hold" value={isHeld ? 'false' : 'true'} />{!isHeld ? <input name="reason" maxLength={200} placeholder="Grunn til hold" /> : null}<input name="adminNote" maxLength={250} placeholder="Intern merknad" defaultValue={control?.admin_note || ''} /><button className={`btn compact ${isHeld ? '' : 'secondary'}`} type="submit">{isHeld ? 'Fjern hold' : 'Sett på hold'}</button></form>
        </article>;
      })}</div>
    </section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Kommende</span><h2>Beløp klare for batching</h2></div></div>{dueDates.length ? <div className="booking-list">{dueDates.map((payoutDate) => {
      const entries = dueEntries.filter((entry) => String(entry.scheduled_payout_date) === payoutDate);
      const total = entries.reduce((sum, entry) => sum + entry.amount_nok, 0);
      const trainerCount = new Set(entries.map((entry) => entry.trainer_id)).size;
      return <article className="booking-row payout-admin-row" key={payoutDate}><div className="booking-date"><strong>{dateOnly(payoutDate)}</strong><span>{entries.length} poster · opptil {trainerCount} trenere før hold/bankkontroll</span></div><div><strong>{money(total)}</strong></div><div className="booking-actions"><form action={createPayoutBatchAction}><input type="hidden" name="payoutDate" value={payoutDate} /><button className="btn compact" type="submit">Opprett utbetalingsbatch</button></form></div></article>;
    })}</div> : <div className="empty-state compact-empty"><h3>Ingen ubatchede utbetalinger</h3><p className="muted">Opptjening blir liggende her til neste 10. eller 25.</p></div>}</section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Batcher</span><h2>Bankutbetalinger</h2></div></div>{(batches || []).length ? <div className="booking-list">{batches!.map((batch) => {
      const batchStatements = (statements || []).filter((s) => s.batch_id === batch.id);
      const batchItems = (items || []).filter((item) => item.batch_id === batch.id);
      const byTrainer = new Map<string, number>();
      for (const item of batchItems) byTrainer.set(item.trainer_id, (byTrainer.get(item.trainer_id) || 0) + item.amount_nok);
      return <article className="payout-batch-card" key={batch.id}>
        <div className="booking-request-main"><div><span className={`status ${batch.status}`}>{batch.status === 'paid' ? 'Betalt' : 'Klar for bank'}</span><h3>{dateOnly(batch.payout_date)}</h3><p className="muted">{batch.period_start && batch.period_end ? `Periode ${batch.period_start} til ${batch.period_end} · ` : ''}{batch.trainer_count} trenere · {money(batch.total_nok)}{batch.exported_at ? ' · CSV eksportert' : ''}</p></div><div className="booking-actions-inline"><a className="btn secondary compact" href={`/admin/payouts/${batch.id}/export`}>Eksporter CSV</a>{batch.status === 'draft' ? <form action={markPayoutBatchPaidAction} className="booking-actions-inline"><input type="hidden" name="batchId" value={batch.id} /><input name="bankReference" placeholder="Bankreferanse" /><button className="btn compact" type="submit">Marker som betalt</button></form> : <span className="muted small">{batch.bank_reference ? `Ref: ${batch.bank_reference}` : 'Utbetalt'}</span>}</div></div>
        <div className="payout-breakdown">{[...byTrainer.entries()].map(([trainerId, amount]) => {
          const payout = payoutMap.get(trainerId);
          const statement = batchStatements.find((s) => s.trainer_id === trainerId);
          return <div className="payout-breakdown-row" key={trainerId}><div><strong>{trainerMap.get(trainerId) || 'Trener'}</strong><span>{payout?.account_holder_name || 'Kontoeier mangler'} · {maskAccount(payout?.bank_account_number)}{statement ? ` · ${statement.statement_number}` : ''}</span></div><div className="booking-actions-inline"><strong>{money(amount)}</strong>{statement ? <a className="text-link" href={`/payout-statements/${statement.id}`}>PDF</a> : null}</div></div>;
        })}</div>
      </article>;
    })}</div> : <div className="empty-state compact-empty"><h3>Ingen utbetalingsbatcher ennå</h3></div>}</section>
  </main>;
}
