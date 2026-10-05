import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CircleAlert,
  Mail,
  ShieldCheck,
  UserRoundMinus,
  UsersRound,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

function money(value: number) {
  return new Intl.NumberFormat('nb-NO').format(value) + ' kr';
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}

const reportType: Record<string, string> = {
  trainer: 'Trenerprofil',
  review: 'Vurdering',
  message: 'Melding',
  user: 'Bruker',
};

export default async function AdminOverviewPage() {
  const admin = createAdminClient();

  const [
    { count: openReports },
    { count: pendingTrainers },
    { count: suspendedUsers },
    { count: privacyRequests },
    { count: activeUsers },
    { count: verifiedTrainers },
    { data: payoutRows },
    { data: recentReports },
    { data: recentVerification },
    { data: recentBatches },
    { count: newsletterSubscribers },
  ] = await Promise.all([
    admin.from('moderation_reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_review']),
    admin.from('trainer_verification_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'suspended'),
    admin.from('account_deletion_requests').select('id', { count: 'exact', head: true }).in('status', ['requires_review', 'pending']),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'active'),
    admin.from('trainer_profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'approved'),
    admin.from('trainer_ledger').select('amount_nok').eq('status', 'eligible'),
    admin.from('moderation_reports').select('id,target_type,reason,status,created_at').in('status', ['open', 'in_review']).order('created_at', { ascending: false }).limit(5),
    admin.from('trainer_verification_submissions').select('id,trainer_id,legal_name,status,submitted_at').eq('status', 'pending').order('submitted_at', { ascending: true }).limit(5),
    admin.from('payout_batches').select('id,payout_date,total_nok,trainer_count,status,created_at').order('created_at', { ascending: false }).limit(4),
    admin.from('newsletter_subscriptions').select('id', { count: 'exact', head: true }).eq('scope', 'platform').is('unsubscribed_at', null),
  ]);

  const payoutReady = (payoutRows || []).reduce((sum, row) => sum + Number(row.amount_nok || 0), 0);
  const attentionCount = Number(openReports || 0) + Number(pendingTrainers || 0) + Number(privacyRequests || 0);

  return (
    <main className="admin-overview-page">
      <section className="admin-overview-header">
        <div>
          <span className="eyebrow">Adminoversikt</span>
          <h1>God oversikt, uten støy.</h1>
          <p className="muted">Se hva som trenger oppmerksomhet, følg økonomien og hopp direkte til dagens viktigste adminoppgaver.</p>
        </div>
        <div className="admin-overview-actions">
          <Link className="btn secondary" href="/admin/moderation"><ShieldCheck size={16} /> Moderering</Link>
          <Link className="btn" href="/admin/trainers"><BadgeCheck size={16} /> Trenerkø</Link>
        </div>
      </section>

      <section className="admin-kpi-grid">
        <Link className="admin-kpi-card admin-kpi-alert" href="/admin/moderation">
          <span><CircleAlert size={17} /> Krever oppfølging</span>
          <strong>{attentionCount}</strong>
          <small>{openReports || 0} rapporter · {pendingTrainers || 0} trenerkø · {privacyRequests || 0} personvern</small>
        </Link>
        <Link className="admin-kpi-card" href="/admin/payouts">
          <span><Banknote size={17} /> Klar for utbetaling</span>
          <strong>{money(payoutReady)}</strong>
          <small>Opptjening som ikke er batchet ennå</small>
        </Link>
        <Link className="admin-kpi-card" href="/admin/trainers">
          <span><BadgeCheck size={17} /> Godkjente trenere</span>
          <strong>{verifiedTrainers || 0}</strong>
          <small>{pendingTrainers || 0} venter på vurdering</small>
        </Link>
        <Link className="admin-kpi-card" href="/admin/users">
          <span><UsersRound size={17} /> Aktive brukere</span>
          <strong>{activeUsers || 0}</strong>
          <small>{suspendedUsers || 0} suspenderte kontoer</small>
        </Link>
      </section>

      <section className="admin-overview-grid">
        <div className="admin-dashboard-panel admin-attention-panel">
          <div className="admin-panel-head">
            <div><span className="eyebrow">Oppfølging</span><h2>Dette trenger oppmerksomhet</h2></div>
          </div>
          <div className="admin-attention-list">
            <Link href="/admin/moderation?status=open" className={openReports ? 'admin-attention-row urgent' : 'admin-attention-row'}>
              <div className="admin-attention-icon"><ShieldCheck size={18} /></div>
              <div><strong>Moderering</strong><span>{openReports || 0} åpne eller aktive rapporter</span></div>
              <ArrowRight size={16} />
            </Link>
            <Link href="/admin/trainers" className={pendingTrainers ? 'admin-attention-row urgent' : 'admin-attention-row'}>
              <div className="admin-attention-icon"><BadgeCheck size={18} /></div>
              <div><strong>Trenerverifisering</strong><span>{pendingTrainers || 0} søknader venter</span></div>
              <ArrowRight size={16} />
            </Link>
            <Link href="/admin/privacy" className={privacyRequests ? 'admin-attention-row urgent' : 'admin-attention-row'}>
              <div className="admin-attention-icon"><UserRoundMinus size={18} /></div>
              <div><strong>Personvern</strong><span>{privacyRequests || 0} sletteforespørsler i behandling</span></div>
              <ArrowRight size={16} />
            </Link>
            <Link href="/admin/users?status=suspended" className="admin-attention-row">
              <div className="admin-attention-icon"><UsersRound size={18} /></div>
              <div><strong>Suspenderte kontoer</strong><span>{suspendedUsers || 0} kontoer er suspendert</span></div>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className="admin-dashboard-panel admin-quick-panel">
          <div className="admin-panel-head"><div><span className="eyebrow">Snarveier</span><h2>Administrer plattformen</h2></div></div>
          <div className="admin-quick-grid">
            <Link href="/admin/finance"><Banknote size={20} /><strong>Økonomi</strong><span>Inntekter og Stripe</span></Link>
            <Link href="/admin/payouts"><Banknote size={20} /><strong>Utbetalinger</strong><span>Batcher og bank</span></Link>
            <Link href="/admin/newsletter"><Mail size={20} /><strong>Nyhetsbrev</strong><span>{newsletterSubscribers || 0} abonnenter</span></Link>
            <Link href="/admin/users"><UsersRound size={20} /><strong>Brukere</strong><span>Søk og suspensjon</span></Link>
          </div>
        </div>

        <div className="admin-dashboard-panel">
          <div className="admin-panel-head"><div><span className="eyebrow">Moderering</span><h2>Siste rapporter</h2></div><Link className="admin-panel-link" href="/admin/moderation">Se alle <ArrowRight size={14} /></Link></div>
          {recentReports?.length ? <div className="admin-activity-list">{recentReports.map((report) => (
            <Link href={`/admin/moderation?status=${report.status}`} className="admin-activity-row" key={report.id}>
              <div><strong>{reportType[report.target_type] || 'Rapport'}</strong><span>{report.reason}</span></div>
              <time>{dateTime(report.created_at)}</time>
            </Link>
          ))}</div> : <div className="admin-mini-empty"><ShieldCheck size={20} /><span>Ingen åpne rapporter.</span></div>}
        </div>

        <div className="admin-dashboard-panel">
          <div className="admin-panel-head"><div><span className="eyebrow">Trenere</span><h2>Verifisering i kø</h2></div><Link className="admin-panel-link" href="/admin/trainers">Åpne kø <ArrowRight size={14} /></Link></div>
          {recentVerification?.length ? <div className="admin-activity-list">{recentVerification.map((submission) => (
            <Link href="/admin/trainers" className="admin-activity-row" key={submission.id}>
              <div><strong>{submission.legal_name || 'Ny trener'}</strong><span>Venter på gjennomgang</span></div>
              <time>{dateTime(submission.submitted_at)}</time>
            </Link>
          ))}</div> : <div className="admin-mini-empty"><BadgeCheck size={20} /><span>Ingen trenerprofiler venter.</span></div>}
        </div>

        <div className="admin-dashboard-panel admin-wide-panel">
          <div className="admin-panel-head"><div><span className="eyebrow">Økonomi</span><h2>Siste utbetalingsbatcher</h2></div><Link className="admin-panel-link" href="/admin/payouts">Utbetalinger <ArrowRight size={14} /></Link></div>
          {recentBatches?.length ? <div className="admin-batch-list">{recentBatches.map((batch) => (
            <div className="admin-batch-row" key={batch.id}>
              <div><strong>{new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', timeZone: 'Europe/Oslo' }).format(new Date(`${batch.payout_date}T12:00:00+02:00`))}</strong><span>{batch.trainer_count || 0} trenere · {batch.status === 'paid' ? 'Betalt' : 'Klar for bank'}</span></div>
              <strong>{money(Number(batch.total_nok || 0))}</strong>
            </div>
          ))}</div> : <div className="admin-mini-empty"><Banknote size={20} /><span>Ingen utbetalingsbatcher ennå.</span></div>}
        </div>
      </section>
    </main>
  );
}
