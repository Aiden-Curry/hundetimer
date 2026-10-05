'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type TrainerProfile = {
  id: string;
  slug: string;
  business_name: string;
  city: string;
  bio: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  website_url: string | null;
  instagram_url: string | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
  latitude: number | null;
  longitude: number | null;
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normaliseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export function TrainerProfileEditor({ profile }: { profile: TrainerProfile }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(profile.business_name);
  const [slug, setSlug] = useState(profile.slug);
  const [city, setCity] = useState(profile.city);
  const [bio, setBio] = useState(profile.bio || '');
  const [specialties, setSpecialties] = useState((profile.specialties || []).join(', '));
  const [languages, setLanguages] = useState((profile.languages || []).join(', '));
  const [websiteUrl, setWebsiteUrl] = useState(profile.website_url || '');
  const [instagramUrl, setInstagramUrl] = useState(profile.instagram_url || '');
  const [profileImageUrl, setProfileImageUrl] = useState(profile.profile_image_url || '');
  const [coverImageUrl, setCoverImageUrl] = useState(profile.cover_image_url || '');
  const [latitude, setLatitude] = useState(profile.latitude == null ? '' : String(profile.latitude));
  const [longitude, setLongitude] = useState(profile.longitude == null ? '' : String(profile.longitude));
  const [locationStatus, setLocationStatus] = useState(profile.latitude != null && profile.longitude != null ? 'Posisjon lagret' : '');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const profilePreview = useMemo(() => profileFile ? URL.createObjectURL(profileFile) : profileImageUrl, [profileFile, profileImageUrl]);
  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : coverImageUrl, [coverFile, coverImageUrl]);

  async function upload(file: File, kind: 'profile' | 'cover', userId: string) {
    if (file.size > 5 * 1024 * 1024) throw new Error('Bildet kan ikke være større enn 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Bruk JPG, PNG eller WebP.');
    const supabase = createClient();
    const path = `${userId}/${kind}-${Date.now()}.${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage.from('trainer-media').upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    return supabase.storage.from('trainer-media').getPublicUrl(path).data.publicUrl;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const cleanedSlug = slugify(slug || businessName);
      if (!businessName.trim()) throw new Error('Skriv inn navn på trener eller virksomhet.');
      if (!cleanedSlug) throw new Error('Profiladressen er ugyldig.');
      if (!city.trim()) throw new Error('Skriv inn sted.');

      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Du må være logget inn.');

      let nextProfileImage = profileImageUrl || null;
      let nextCoverImage = coverImageUrl || null;
      if (profileFile) nextProfileImage = await upload(profileFile, 'profile', user.id);
      if (coverFile) nextCoverImage = await upload(coverFile, 'cover', user.id);

      const { error: trainerError } = await supabase.from('trainer_profiles').update({
        business_name: businessName.trim(),
        slug: cleanedSlug,
        city: city.trim(),
        bio: bio.trim() || null,
        specialties: specialties.split(',').map((item) => item.trim()).filter(Boolean),
        languages: languages.split(',').map((item) => item.trim()).filter(Boolean),
        website_url: normaliseUrl(websiteUrl),
        instagram_url: normaliseUrl(instagramUrl),
        profile_image_url: nextProfileImage,
        cover_image_url: nextCoverImage,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);

      if (trainerError) {
        if (trainerError.code === '23505') throw new Error('Denne profiladressen er allerede i bruk.');
        throw trainerError;
      }

      const { error: profileError } = await supabase.from('profiles').update({
        display_name: businessName.trim(),
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (profileError) throw profileError;

      setSlug(cleanedSlug);
      setProfileImageUrl(nextProfileImage || '');
      setCoverImageUrl(nextCoverImage || '');
      setProfileFile(null);
      setCoverFile(null);
      setMessage('Profilen er lagret.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre profilen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="profile-editor" onSubmit={handleSubmit}>
      <section className="editor-card media-editor-card">
        <div className="section-title"><div><span className="eyebrow">Bilder</span><h2>Profil- og forsidebilde</h2></div></div>
        <div className="cover-upload-preview" style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined}>
          {!coverPreview ? <span>Forsidebilde</span> : null}
        </div>
        <div className="profile-photo-row">
          <div className="profile-photo-preview">{profilePreview ? <img src={profilePreview} alt="Profilbilde" /> : <span>{businessName.slice(0, 1) || '?'}</span>}</div>
          <div className="media-inputs">
            <label>Profilbilde<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setProfileFile(e.target.files?.[0] || null)} /></label>
            <label>Forsidebilde<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} /></label>
            <p className="muted small">JPG, PNG eller WebP. Maks 5 MB per bilde.</p>
          </div>
        </div>
      </section>

      <section className="editor-card">
        <div className="section-title"><div><span className="eyebrow">Profil</span><h2>Om deg og virksomheten</h2></div></div>
        <div className="form-grid editor-form-grid">
          <label>Navn på trener eller virksomhet<input value={businessName} onChange={(e) => { setBusinessName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} required /></label>
          <label>Sted<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hamar" required /></label>
          <div className="profile-location-control"><span className="field-label">Avstandssøk</span><button className="btn secondary compact" type="button" onClick={() => { if (!navigator.geolocation) { setLocationStatus('Nettleseren støtter ikke posisjon.'); return; } setLocationStatus('Henter posisjon…'); navigator.geolocation.getCurrentPosition((position) => { setLatitude(position.coords.latitude.toFixed(3)); setLongitude(position.coords.longitude.toFixed(3)); setLocationStatus('Omtrentlig posisjon lagret. Husk å lagre profilen.'); }, () => setLocationStatus('Kunne ikke hente posisjon.')); }}>Bruk min posisjon</button><span className="muted tiny">{locationStatus || 'Valgfritt, brukes bare til avstandsfilter.'}</span></div>
          <label className="full">Kort beskrivelse<textarea rows={5} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Fortell hundeeiere hvordan du trener og hvem du hjelper." /></label>
          <label className="full">Spesialiteter, separert med komma<input value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="Valp, passeringstrening, innkalling" /></label>
          <label>Språk, separert med komma<input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Norsk, engelsk" /></label>
          <label>Profiladresse<div className="slug-input-wrap"><span>/trainers/</span><input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} required /></div></label>
          <label>Nettside<input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="www.eksempel.no" /></label>
          <label>Instagram<input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="instagram.com/dittnavn" /></label>
        </div>
      </section>

      {message ? <p role="status" className="form-success">{message}</p> : null}
      {error ? <p role="alert" className="form-error form-error-block">{error}</p> : null}
      <div className="editor-actions"><button className="btn" type="submit" disabled={loading}>{loading ? 'Lagrer…' : 'Lagre profil'}</button><a className="btn secondary" href={`/trainers/${slugify(slug || businessName)}`} target="_blank" rel="noreferrer">Forhåndsvis profil</a></div>
    </form>
  );
}
