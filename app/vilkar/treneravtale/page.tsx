import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import './agreement.css';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRAINER_AGREEMENT_EFFECTIVE_LABEL, TRAINER_AGREEMENT_VERSION, trainerAgreementOperator, trainerAgreementSections } from '@/lib/legal/trainer-agreement';
import { signTrainerAgreementAction } from './actions';

export const metadata: Metadata = { title: 'Treneravtale', description: 'Privat treneravtale for hundetrenere på Hundetimer.' };

function dateTime(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

export default async function TrainerAgreementPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/vilkar/treneravtale');

  const admin = createAdminClient();
  const [{ data: profile }, { data: trainer }, { data: latest }, { data: agreement }] = await Promise.all([
    admin.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle(),
    admin.from('trainer_profiles').select('business_name,verification_status').eq('id', user.id).maybeSingle(),
    admin.from('trainer_verification_submissions').select('id,status,agreement_sent_at').eq('trainer_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('trainer_agreement_acceptances').select('id,agreement_version,trainer_signature_name,trainer_signed_at,admin_signature_name,admin_signed_at').eq('trainer_id', user.id).eq('agreement_version', TRAINER_AGREEMENT_VERSION).maybeSingle(),
  ]);

  const isAdmin = profile?.role === 'admin';
  const approvedTrainer = profile?.role === 'trainer' && ['approved', 'suspended'].includes(trainer?.verification_status || '');
  const invitedApplicant = latest?.status === 'pending' && Boolean(latest.agreement_sent_at);
  if (!isAdmin && !approvedTrainer && !invitedApplicant) redirect('/bli-trener#soknad');

  const operator = trainerAgreementOperator();
  const sections = trainerAgreementSections();
  const canSign = !isAdmin && !agreement?.trainer_signed_at && (approvedTrainer || invitedApplicant);
  const backHref = isAdmin ? '/admin/trainers' : '/trainer-dashboard/verification';
  const backLabel = isAdmin ? 'Til admin' : 'Til søknadsstatus';

  return <main className="page-shell legal-page trainer-agreement-page">
    <section className="legal-heading"><Link className="back-link" href={backHref}><ArrowLeft size={16} aria-hidden="true" />{backLabel}</Link><h1>Treneravtale</h1><p className="lead muted">Versjon {TRAINER_AGREEMENT_VERSION}, gjelder fra {TRAINER_AGREEMENT_EFFECTIVE_LABEL}.</p><div className="legal-meta"><span><strong>Plattformoperatør</strong>{operator.legalName}{operator.organisationNumber ? `, org.nr. ${operator.organisationNumber}` : ''}</span><span><strong>Trener</strong>{trainer?.business_name || profile?.display_name || 'Ikke oppgitt'}</span></div><div className="legal-actions">{agreement?.trainer_signed_at ? <a className="btn secondary" href={`/trainer-agreement/${agreement.id}`}><Download size={16} aria-hidden="true" />Last ned signert PDF</a> : <a className="btn secondary" href="/trainer-agreement/current"><Download size={16} aria-hidden="true" />Last ned avtalen som PDF</a>}{canSign && <a className="agreement-sign-link" href="#signer">Til signering</a>}</div></section>
    {params.message ? <div className="notice success dashboard-flash" role="status">{params.message}</div> : null}
    {params.error ? <div className="notice error dashboard-flash" role="alert">{params.error}</div> : null}
    <div className="legal-layout"><nav className="legal-toc" aria-label="Avtalens innhold"><strong>Innhold</strong>{sections.map((section,index)=><a href={`#del-${index+1}`} key={section.title}>{section.title}</a>)}{canSign && <a className="agreement-toc-sign" href="#signer">Signering</a>}</nav><article className="legal-document">
      {agreement?.trainer_signed_at ? <div className="notice success"><strong>Din signatur er registrert ✓</strong><p>{agreement.trainer_signature_name || trainer?.business_name || 'Trener'} signerte {agreement.trainer_signed_at ? dateTime(agreement.trainer_signed_at) : 'avtalen'}.</p>{agreement.admin_signed_at ? <p>Hundetimer signerte {dateTime(agreement.admin_signed_at)}{agreement.admin_signature_name ? ` som ${agreement.admin_signature_name}` : ''}. Avtalen er signert av begge parter.</p> : <p>Avtalen venter på signatur fra Hundetimer før søknaden kan godkjennes.</p>}</div> : <div className="notice"><strong>Elektronisk signering</strong><p>Les hele avtalen før du signerer. Signaturen registreres med avtaleversjon, tidspunkt og dokumenthash. Hundetimer signerer avtalen etter deg før eventuell endelig godkjenning som trener.</p></div>}
      {sections.map((section,index)=><section id={`del-${index+1}`} className="legal-section" key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph,i)=><p key={i}>{paragraph}</p>)}</section>)}
      {canSign ? <section className="dashboard-section agreement-signature-box" id="signer"><h2>Signer treneravtalen</h2><p className="muted">Skriv inn fullt navn. Dette brukes som din elektroniske signatur på avtalen.</p><form action={signTrainerAgreementAction} className="form-grid"><label className="full">Fullt navn<input name="signatureName" required minLength={2} defaultValue={profile?.display_name || ''} autoComplete="name" /></label><label className="checkbox-row full"><input type="checkbox" name="confirmSignature" required /><span><strong>Jeg har lest avtalen og signerer den elektronisk</strong><small>Jeg forstår at Hundetimer må signere avtalen etter meg før søknaden kan godkjennes.</small></span></label><div className="full"><button className="btn" type="submit">Signer treneravtalen</button></div></form></section> : null}
    </article></div>
  </main>;
}
