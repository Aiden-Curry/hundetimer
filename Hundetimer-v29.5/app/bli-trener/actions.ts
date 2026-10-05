'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRAINER_AGREEMENT_VERSION, trainerAgreementPlainText } from '@/lib/legal/trainer-agreement';

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 70);
}

function fail(message: string): never {
  redirect(`/bli-trener?error=${encodeURIComponent(message)}#soknad`);
}

function value(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim();
}

export async function submitTrainerApplicationAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/bli-trener');

  if (formData.get('acceptAgreement') !== 'on') fail('Du må lese og godta treneravtalen før søknaden kan sendes.');

  const businessName = value(formData, 'businessName');
  const city = value(formData, 'city');
  const bio = value(formData, 'bio');
  const specialties = value(formData, 'specialties').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20);
  const legalName = value(formData, 'legalName');
  const organisationNumber = value(formData, 'organisationNumber').replace(/\D/g, '').slice(0, 9);
  const yearsExperienceRaw = value(formData, 'yearsExperience');
  const qualifications = value(formData, 'qualifications');
  const note = value(formData, 'note');

  if (!businessName) fail('Skriv inn navn på treneren eller virksomheten.');
  if (!city) fail('Skriv inn stedet du holder til.');
  if (!bio) fail('Skriv en kort beskrivelse av deg og treningen din.');
  if (!legalName) fail('Skriv inn juridisk navn.');
  const yearsExperience = yearsExperienceRaw ? Number(yearsExperienceRaw) : null;
  if (yearsExperience !== null && (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 80)) fail('Skriv inn et gyldig antall år med erfaring.');

  const admin = createAdminClient();
  const [{ data: profile }, { data: existingTrainer }, { data: currentAgreement }] = await Promise.all([
    admin.from('profiles').select('id,role,display_name').eq('id', user.id).maybeSingle(),
    admin.from('trainer_profiles').select('id,slug,verification_status').eq('id', user.id).maybeSingle(),
    admin.from('trainer_agreement_versions').select('version').eq('is_current', true).maybeSingle(),
  ]);

  if (!profile) fail('Fant ikke Hundetimer-kontoen din.');
  if (profile.role === 'admin') fail('Administratorkontoer kan ikke sende trenersøknad fra denne siden.');
  if (existingTrainer?.verification_status === 'pending') fail('Søknaden din er allerede til vurdering.');
  if (existingTrainer?.verification_status === 'approved' || (profile.role === 'trainer' && existingTrainer?.verification_status === 'suspended')) redirect('/trainer-dashboard');
  if (!currentAgreement || currentAgreement.version !== TRAINER_AGREEMENT_VERSION) fail('Treneravtalen er ikke synkronisert i databasen ennå.');

  let slug = existingTrainer?.slug || slugify(businessName);
  if (!slug) slug = `trener-${user.id.slice(0, 8)}`;
  if (!existingTrainer) {
    const { data: slugOwner } = await admin.from('trainer_profiles').select('id').eq('slug', slug).maybeSingle();
    if (slugOwner && slugOwner.id !== user.id) slug = `${slug}-${user.id.slice(0, 6)}`;
  }

  try {
    const now = new Date().toISOString();
    const { error: trainerError } = await admin.from('trainer_profiles').upsert({
      id: user.id,
      slug,
      business_name: businessName,
      city,
      bio,
      specialties,
      verified: false,
      verification_status: 'not_submitted',
      verification_submitted_at: null,
      verification_reviewed_at: null,
      verification_review_note: null,
      updated_at: now,
    }, { onConflict: 'id' });
    if (trainerError) throw trainerError;

    const { data: existingAcceptance } = await admin
      .from('trainer_agreement_acceptances')
      .select('id')
      .eq('trainer_id', user.id)
      .eq('agreement_version', TRAINER_AGREEMENT_VERSION)
      .maybeSingle();

    let acceptanceId = existingAcceptance?.id || null;
    if (!acceptanceId) {
      const snapshot = trainerAgreementPlainText();
      const contentHash = createHash('sha256').update(snapshot, 'utf8').digest('hex');
      const requestHeaders = await headers();
      const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip')?.trim() || null;
      const userAgent = requestHeaders.get('user-agent')?.slice(0, 1000) || null;
      const { data: acceptance, error: acceptanceError } = await admin.from('trainer_agreement_acceptances').insert({
        trainer_id: user.id,
        agreement_version: TRAINER_AGREEMENT_VERSION,
        agreement_snapshot: snapshot,
        content_sha256: contentHash,
        ip_address: forwardedFor,
        user_agent: userAgent,
        acceptance_method: 'clickwrap',
      }).select('id').single();
      if (acceptanceError || !acceptance) throw acceptanceError || new Error('Kunne ikke registrere treneravtalen.');
      acceptanceId = acceptance.id;
    }

    const { error: submissionError } = await admin.from('trainer_verification_submissions').insert({
      trainer_id: user.id,
      status: 'pending',
      legal_name: legalName,
      organisation_number: organisationNumber || null,
      years_experience: yearsExperience,
      qualifications: qualifications || null,
      note_to_admin: note || null,
      agreement_acceptance_id: acceptanceId,
    });
    if (submissionError) throw submissionError;

    const { error: statusError } = await admin.from('trainer_profiles').update({
      verified: false,
      verification_status: 'pending',
      verification_submitted_at: now,
      verification_reviewed_at: null,
      verification_review_note: null,
      updated_at: now,
    }).eq('id', user.id);
    if (statusError) throw statusError;
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Kunne ikke sende søknaden.');
  }

  revalidatePath('/bli-trener');
  revalidatePath('/account');
  revalidatePath('/admin/trainers');
  redirect('/bli-trener?message=Søknaden+er+sendt+til+vurdering#soknad');
}
