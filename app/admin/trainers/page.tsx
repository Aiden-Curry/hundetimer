import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  approveTrainerVerificationAction,
  countersignTrainerAgreementAction,
  rejectTrainerVerificationAction,
  sendTrainerAgreementAction,
  suspendTrainerAction,
} from './actions';

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

const kindText: Record<string, string> = { qualification: 'Kvalifikasjon', business: 'Virksomhet', insurance: 'Forsikring', identity: 'Identitet', other: 'Annet' };

type AgreementRow = {
  id: string;
  trainer_id: string;
  agreement_version: string;
  accepted_at: string;
  trainer_signature_name: string | null;
  trainer_signed_at: string | null;
  admin_signature_name: string | null;
  admin_signed_at: string | null;
};

export default async function AdminTrainersPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/trainers');
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/');

  const admin = createAdminClient();
  const [{ data: submissions }, { data: trainerRows }, { data: agreementAcceptances }] = await Promise.all([
    admin.from('trainer_verification_submissions').select('*').order('submitted_at', { ascending: true }),
    admin.from('trainer_profiles').select('id,business_name,city,slug,verified,verification_status,verification_reviewed_at,verification_review_note').order('business_name'),
    admin.from('trainer_agreement_acceptances').select('id,trainer_id,agreement_version,accepted_at,trainer_signature_name,trainer_signed_at,admin_signature_name,admin_signed_at').order('accepted_at', { ascending: false }),
  ]);

  const trainerMap = new Map((trainerRows || []).map((trainer) => [trainer.id, trainer]));
  const agreementByTrainer = new Map<string, AgreementRow>();
  for (const agreement of (agreementAcceptances || []) as AgreementRow[]) {
    if (!agreementByTrainer.has(agreement.trainer_id)) agreementByTrainer.set(agreement.trainer_id, agreement);
  }

  const pending = (submissions || []).filter((submission) => submission.status === 'pending');
  const pendingIds = pending.map((submission) => submission.id);
  const { data: documents } = pendingIds.length
    ? await admin.from('trainer_verification_documents').select('*').in('submission_id', pendingIds).order('created_at')
    : { data: [] as Array<{ id: string; submission_id: string; kind: string; file_path: string; file_name: string; mime_type: string | null }> };

  const signedDocumentMap = new Map<string, { url: string; fileName: string; kind: string }[]>();
  for (const doc of documents || []) {
    const { data } = await admin.storage.from('trainer-verification').createSignedUrl(doc.file_path, 60 * 30);
    if (!data?.signedUrl) continue;
    signedDocumentMap.set(doc.submission_id, [...(signedDocumentMap.get(doc.submission_id) || []), { url: data.signedUrl, fileName: doc.file_name, kind: doc.kind }]);
  }

  const approved = (trainerRows || []).filter((trainer) => trainer.verification_status === 'approved');
  const other = (trainerRows || []).filter((trainer) => ['rejected', 'suspended'].includes(trainer.verification_status));

  return <main className="dashboard">
    <section className="dashboard-heading"><div><span className="eyebrow">Admin</span><h1>Trenerverifisering</h1><p className="muted">Vurder søknaden, send avtalen, la treneren signere, signer fra Hundetimer og godkjenn deretter treneren.</p>{params.message ? <p className="form-success dashboard-flash">{params.message}</p> : null}{params.error ? <p className="form-error form-error-block dashboard-flash">{params.error}</p> : null}</div><div className="dashboard-heading-actions"><Link className="btn secondary" href="/admin/finance">Økonomi</Link><Link className="btn secondary" href="/admin/payouts">Utbetalinger</Link><Link className="btn" href="/discover">Se markedsplassen</Link></div></section>

    <section className="stats-grid"><div className="stat-card"><span className="muted small">Til vurdering</span><strong>{pending.length}</strong></div><div className="stat-card"><span className="muted small">Godkjente trenere</span><strong>{approved.length}</strong></div><div className="stat-card"><span className="muted small">Avvist / skjult</span><strong>{other.length}</strong></div></section>

    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">Kø</span><h2>Søknader til vurdering</h2></div></div>
      {pending.length ? <div className="verification-admin-list">{pending.map((submission) => {
        const trainer = trainerMap.get(submission.trainer_id);
        const docs = signedDocumentMap.get(submission.id) || [];
        const agreement = agreementByTrainer.get(submission.trainer_id);
        const trainerSigned = Boolean(agreement?.trainer_signed_at);
        const adminSigned = Boolean(agreement?.admin_signed_at);
        return <article className="verification-admin-card" key={submission.id}>
          <div className="verification-admin-head"><div><span className="eyebrow">Sendt {dateTime(submission.submitted_at)}</span><h3>{trainer?.business_name || submission.legal_name}</h3><p className="muted">{trainer?.city || 'Ukjent sted'} · Juridisk navn: {submission.legal_name}</p></div>{trainer?.slug ? <Link className="text-link" href={`/trainers/${trainer.slug}`} target="_blank">Forhåndsvis →</Link> : null}</div>

          <div className="verification-admin-grid">
            <div><strong>Organisasjonsnummer</strong><p>{submission.organisation_number || 'Ikke oppgitt'}</p></div>
            <div><strong>Erfaring</strong><p>{submission.years_experience == null ? 'Ikke oppgitt' : `${submission.years_experience} år`}</p></div>
            <div className="full"><strong>Kvalifikasjoner</strong><p className="preline">{submission.qualifications || 'Ikke oppgitt'}</p></div>
            {submission.note_to_admin ? <div className="full"><strong>Melding</strong><p className="preline">{submission.note_to_admin}</p></div> : null}
          </div>

          {docs.length ? <div className="verification-documents"><strong>Dokumenter</strong><div className="chips">{docs.map((doc, index) => <a className="chip verification-doc-link" href={doc.url} target="_blank" rel="noreferrer" key={`${doc.url}-${index}`}>{kindText[doc.kind] || 'Dokument'}: {doc.fileName} ↗</a>)}</div></div> : <p className="muted small">Ingen dokumenter lastet opp.</p>}

          <div className="dashboard-section agreement-admin-flow">
            <div className="section-title"><div><span className="eyebrow">Treneravtale</span><h3>Signeringsstatus</h3></div>{agreement ? <a className="text-link small" href={`/trainer-agreement/${agreement.id}`}>Last ned avtale</a> : null}</div>
            <div className="agreement-signing-steps">
              <div className={submission.agreement_sent_at ? 'agreement-step is-complete' : 'agreement-step'}><strong>1. Send avtalen</strong><span>{submission.agreement_sent_at ? `Sendt ${dateTime(submission.agreement_sent_at)}` : 'Ikke sendt ennå'}</span></div>
              <div className={trainerSigned ? 'agreement-step is-complete' : 'agreement-step'}><strong>2. Trener signerer</strong><span>{trainerSigned ? `${agreement?.trainer_signature_name || 'Trener'} · ${dateTime(agreement!.trainer_signed_at!)}` : submission.agreement_sent_at ? 'Venter på trenerens signatur' : 'Åpnes når avtalen sendes'}</span></div>
              <div className={adminSigned ? 'agreement-step is-complete' : 'agreement-step'}><strong>3. Hundetimer signerer</strong><span>{adminSigned ? `${agreement?.admin_signature_name || 'Hundetimer'} · ${dateTime(agreement!.admin_signed_at!)}` : trainerSigned ? 'Klar for din signatur' : 'Venter på trenerens signatur'}</span></div>
              <div className={adminSigned ? 'agreement-step is-ready' : 'agreement-step'}><strong>4. Endelig godkjenning</strong><span>{adminSigned ? 'Avtalen er klar. Treneren kan godkjennes.' : 'Låst til begge har signert'}</span></div>
            </div>

            {!submission.agreement_sent_at ? <form action={sendTrainerAgreementAction}><input type="hidden" name="submissionId" value={submission.id} /><button className="btn" type="submit">Send treneravtale</button></form> : null}
            {trainerSigned && !adminSigned ? <form action={countersignTrainerAgreementAction} className="form-grid compact-form"><input type="hidden" name="submissionId" value={submission.id} /><label className="full">Signatur fra Hundetimer<input name="signatureName" required defaultValue={profile.display_name || 'Hundetimer'} /></label><div className="full"><button className="btn" type="submit">Signer avtalen fra Hundetimer</button></div></form> : null}
          </div>

          <div className="verification-review-actions">
            {adminSigned ? <form action={approveTrainerVerificationAction}><input type="hidden" name="submissionId" value={submission.id} /><label>Intern/godkjenningsmerknad<textarea name="note" rows={2} placeholder="Valgfritt" /></label><button className="btn" type="submit">Godkjenn trener</button></form> : <div className="notice"><strong>Godkjenning er låst.</strong><p>Treneravtalen må være signert av både treneren og Hundetimer først.</p></div>}
            <form action={rejectTrainerVerificationAction}><input type="hidden" name="submissionId" value={submission.id} /><label>Hva må endres?<textarea name="note" rows={2} required placeholder="Dette vises til treneren" /></label><button className="btn secondary" type="submit">Avvis og send tilbake</button></form>
          </div>
        </article>;
      })}</div> : <div className="empty-state compact-empty"><h3>Ingen søknader venter</h3><p className="muted">Nye trenersøknader dukker opp her.</p></div>}
    </section>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Aktive</span><h2>Godkjente trenere</h2></div></div>{approved.length ? <div className="booking-list">{approved.map((trainer) => { const agreement = agreementByTrainer.get(trainer.id); return <article className="booking-row" key={trainer.id}><div><strong>{trainer.business_name}</strong><span>{trainer.city} · Godkjent{trainer.verification_reviewed_at ? ` ${dateTime(trainer.verification_reviewed_at)}` : ''}{agreement ? ` · Avtale v${agreement.agreement_version}` : ''}</span></div><div>{agreement ? <a className="text-link small" href={`/trainer-agreement/${agreement.id}`}>Treneravtale</a> : <span className="muted small">Ingen avtale</span>}</div><Link className="text-link" href={`/trainers/${trainer.slug}`}>Profil</Link><form action={suspendTrainerAction} className="inline-cancel-form"><input type="hidden" name="trainerId" value={trainer.id} /><input name="note" placeholder="Grunn til skjuling" /><button className="btn secondary compact-btn" type="submit">Skjul profil</button></form></article>; })}</div> : <p className="muted">Ingen godkjente trenere ennå.</p>}</section>
  </main>;
}
