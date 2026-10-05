'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Status = 'not_submitted' | 'pending' | 'approved' | 'rejected' | 'suspended';
type ExistingSubmission = {
  status: string;
  submitted_at: string;
  admin_note: string | null;
} | null;

type UploadedDocument = {
  kind: 'qualification' | 'business' | 'insurance' | 'identity' | 'other';
  file_path: string;
  file_name: string;
  mime_type: string;
};

function cleanFileName(name: string) {
  const parts = name.split('.');
  const ext = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  const base = parts.join('.').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'dokument';
  return `${base}${ext}`;
}

function statusText(status: Status) {
  if (status === 'approved') return 'Godkjent';
  if (status === 'pending') return 'Til vurdering';
  if (status === 'rejected') return 'Avvist';
  if (status === 'suspended') return 'Midlertidig skjult';
  return 'Ikke sendt';
}

export function TrainerVerificationForm({
  status,
  businessName,
  latestSubmission,
  reviewNote,
}: {
  status: Status;
  businessName: string;
  latestSubmission: ExistingSubmission;
  reviewNote?: string | null;
}) {
  const router = useRouter();
  const [legalName, setLegalName] = useState(businessName);
  const [organisationNumber, setOrganisationNumber] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [note, setNote] = useState('');
  const [qualificationFiles, setQualificationFiles] = useState<File[]>([]);
  const [businessFiles, setBusinessFiles] = useState<File[]>([]);
  const [insuranceFiles, setInsuranceFiles] = useState<File[]>([]);
  const [otherFiles, setOtherFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  async function uploadFiles(files: File[], kind: UploadedDocument['kind'], userId: string, out: UploadedDocument[]) {
    const supabase = createClient();
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} er større enn 10 MB.`);
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: bruk PDF, JPG, PNG eller WebP.`);
      const safeName = cleanFileName(file.name);
      const path = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      setProgress(`Laster opp ${file.name}…`);
      const { error: uploadError } = await supabase.storage.from('trainer-verification').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      out.push({ kind, file_path: path, file_name: file.name, mime_type: file.type });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setProgress('');
    const uploadedPaths: string[] = [];

    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Du må være logget inn.');
      if (!legalName.trim()) throw new Error('Skriv inn juridisk navn.');

      const documents: UploadedDocument[] = [];
      await uploadFiles(qualificationFiles, 'qualification', user.id, documents);
      await uploadFiles(businessFiles, 'business', user.id, documents);
      await uploadFiles(insuranceFiles, 'insurance', user.id, documents);
      await uploadFiles(otherFiles, 'other', user.id, documents);
      uploadedPaths.push(...documents.map((doc) => doc.file_path));

      setProgress('Sender søknaden…');
      const { error: rpcError } = await supabase.rpc('submit_trainer_verification', {
        p_legal_name: legalName.trim(),
        p_organisation_number: organisationNumber.trim() || null,
        p_years_experience: yearsExperience ? Number(yearsExperience) : null,
        p_qualifications: qualifications.trim() || null,
        p_note_to_admin: note.trim() || null,
        p_documents: documents,
      });
      if (rpcError) throw rpcError;

      setProgress('Søknaden er sendt til vurdering.');
      router.refresh();
    } catch (err) {
      // If the DB submission failed after uploads, clean up orphaned private files.
      if (uploadedPaths.length) {
        try { await createClient().storage.from('trainer-verification').remove(uploadedPaths); } catch { /* best effort */ }
      }
      setProgress('');
      setError(err instanceof Error ? err.message : 'Kunne ikke sende søknaden.');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'approved') {
    return <section className="dashboard-section verification-success-card"><span className="eyebrow">Verifisering</span><h2>Profilen er godkjent ✓</h2><p className="muted">Du er synlig i markedsplassen og kan motta offentlige bestillinger, kurskjøp og påmeldinger.</p></section>;
  }

  if (status === 'pending') {
    return <section className="dashboard-section"><span className="eyebrow">Verifisering</span><h2>Søknaden er til vurdering</h2><p className="muted">Vi har mottatt søknaden din{latestSubmission?.submitted_at ? ` ${new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(latestSubmission.submitted_at))}` : ''}. Du kan fortsette å bygge profil, tjenester og kurs mens du venter.</p><div className="notice">Profilen blir offentlig søkbar først etter godkjenning.</div></section>;
  }

  if (status === 'suspended') {
    return <section className="dashboard-section"><span className="eyebrow">Verifisering</span><h2>Profilen er midlertidig skjult</h2><div className="verification-rejected"><strong>Administrator har skjult profilen.</strong><p>{reviewNote || latestSubmission?.admin_note || 'Kontakt plattformadministrasjonen for mer informasjon.'}</p></div><p className="muted">Eksisterende kunder beholder tilgang til kjøpt innhold, men profilen kan ikke motta nye offentlige bestillinger mens den er skjult.</p></section>;
  }

  return <form className="verification-form" onSubmit={submit}>
    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">Status</span><h2>{statusText(status)}</h2></div></div>
      {status === 'rejected' ? <div className="verification-rejected"><strong>Søknaden trenger endringer.</strong><p>{reviewNote || latestSubmission?.admin_note || 'Se over opplysningene og send inn en ny søknad.'}</p></div> : null}
      <p className="muted">Opplysningene under brukes kun til verifisering. Dokumentene publiseres ikke på trenerprofilen.</p>
    </section>

    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">1. Virksomhet</span><h2>Hvem står bak trenerprofilen?</h2></div></div>
      <div className="form-grid">
        <label>Juridisk navn<input value={legalName} onChange={(e) => setLegalName(e.target.value)} required placeholder="Navn eller registrert bedriftsnavn" /></label>
        <label>Organisasjonsnummer<input value={organisationNumber} onChange={(e) => setOrganisationNumber(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" placeholder="9 siffer, hvis relevant" /></label>
        <label>År med erfaring<input type="number" min="0" max="80" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} placeholder="For eksempel 5" /></label>
        <label className="full">Utdanning, kurs og kvalifikasjoner<textarea rows={5} value={qualifications} onChange={(e) => setQualifications(e.target.value)} placeholder="Fortell kort om relevant utdanning, sertifiseringer og erfaring." /></label>
        <label className="full">Melding til oss<textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Valgfritt. Legg til noe du mener er nyttig når vi vurderer profilen." /></label>
      </div>
    </section>

    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">2. Dokumentasjon</span><h2>Last opp det som støtter søknaden</h2></div></div>
      <p className="muted small">PDF, JPG, PNG eller WebP. Maks 10 MB per fil. Du trenger ikke laste opp alle kategorier hvis de ikke er relevante.</p>
      <div className="verification-upload-grid">
        <label><strong>Kursbevis / kvalifikasjoner</strong><input type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setQualificationFiles(Array.from(e.target.files || []))} /><span className="muted tiny">{qualificationFiles.length ? `${qualificationFiles.length} fil(er) valgt` : 'Ingen filer valgt'}</span></label>
        <label><strong>Virksomhetsdokumentasjon</strong><input type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setBusinessFiles(Array.from(e.target.files || []))} /><span className="muted tiny">{businessFiles.length ? `${businessFiles.length} fil(er) valgt` : 'Ingen filer valgt'}</span></label>
        <label><strong>Forsikring, hvis relevant</strong><input type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setInsuranceFiles(Array.from(e.target.files || []))} /><span className="muted tiny">{insuranceFiles.length ? `${insuranceFiles.length} fil(er) valgt` : 'Ingen filer valgt'}</span></label>
        <label><strong>Annet</strong><input type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setOtherFiles(Array.from(e.target.files || []))} /><span className="muted tiny">{otherFiles.length ? `${otherFiles.length} fil(er) valgt` : 'Ingen filer valgt'}</span></label>
      </div>
    </section>

    {error ? <p className="form-error form-error-block">{error}</p> : null}
    {progress ? <p className="form-success">{progress}</p> : null}
    <div className="editor-actions"><button className="btn" type="submit" disabled={loading}>{loading ? 'Sender…' : status === 'rejected' ? 'Send ny søknad' : 'Send til verifisering'}</button></div>
  </form>;
}
