import Link from 'next/link';
import { TrainerCard, type TrainerCardData } from '@/components/trainer-card';
import { LocationFields } from '@/components/location-fields';
import { SaveButton } from '@/components/save-button';
import { createClient } from '@/lib/supabase/server';
import { distanceKm, formatDistance, containsSearch, normalise, numberParam, withinDays } from '@/lib/discovery';
import { formatOsloDateTime } from '@/lib/oslo-time';

type Params = {
  q?: string;
  type?: string;
  place?: string;
  specialty?: string;
  mode?: string;
  radius?: string;
  lat?: string;
  lng?: string;
  maxPrice?: string;
  minRating?: string;
  when?: string;
  sort?: string;
  dog?: string;
};

type TrainerRow = {
  id: string;
  slug: string;
  business_name: string;
  bio: string | null;
  city: string;
  specialties: string[] | null;
  languages: string[] | null;
  verified: boolean;
  profile_image_url: string | null;
  latitude: number | null;
  longitude: number | null;
};
type ServiceRow = { id:string; trainer_id:string; title:string; description:string|null; price_nok:number; delivery_mode:'in_person'|'online'|'both'; active:boolean };
type SlotRow = { trainer_id:string; service_id:string|null; starts_at:string };
type ReviewRow = { trainer_id:string; rating:number };
type OfferingRow = { id:string; trainer_id:string; kind:'course'|'event'; title:string; description:string|null; city:string; venue_name:string|null; is_online:boolean; price_nok:number; capacity:number; confirmed_count:number; tags:string[]|null; latitude:number|null; longitude:number|null };
type SessionRow = { offering_id:string; starts_at:string; ends_at:string };
type OnlineCourseRow = { id:string; trainer_id:string; slug:string; title:string; summary:string|null; description:string|null; cover_image_url:string|null; price_nok:number; tags:string[]|null; level:string; estimated_minutes:number };
type OnlineCourseResult = { course:OnlineCourseRow; trainer:TrainerRow|undefined; ratingAverage:number|null; reviewCount:number; dogScore:number };

type ActivityResult = {
  offering: OfferingRow;
  firstSession: SessionRow;
  sessionCount: number;
  trainer: TrainerRow | undefined;
  ratingAverage: number | null;
  reviewCount: number;
  distance: number | null;
  dogScore: number;
};

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }

function buildQuery(params: Params, overrides: Record<string,string|undefined>) {
  const next = new URLSearchParams();
  Object.entries({ ...params, ...overrides }).forEach(([key, value]) => {
    if (value && value !== 'all' && value !== 'any' && value !== 'recommended') next.set(key, value);
  });
  const query = next.toString();
  return query ? `/discover?${query}` : '/discover';
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: { user } } = await supabase.auth.getUser();
  let dogs: { id:string; name:string; breed:string|null; birth_date:string|null; notes:string|null }[] = [];
  let viewerRole: string | null = null;
  let savedRows: { item_type:string; item_id:string }[] = [];
  if (user) {
    const [dogsRes, viewerProfileRes, savedRes] = await Promise.all([
      supabase.from('dogs').select('id, name, breed, birth_date, notes').eq('owner_id', user.id).order('name'),
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('saved_items').select('item_type,item_id').eq('owner_id', user.id),
    ]);
    dogs = dogsRes.data || [];
    viewerRole = viewerProfileRes.data?.role || null;
    savedRows = savedRes.data || [];
  }
  const canSave = Boolean(user) && viewerRole !== 'admin';
  const showSave = !user || canSave;
  const savedSet = new Set(savedRows.map((item) => `${item.item_type}:${item.item_id}`));
  const selectedDog = dogs.find((dog) => dog.id === params.dog);
  const returnPath = buildQuery(params, {});

  const [trainerRes, serviceRes, slotRes, reviewRes, offeringRes, sessionRes, onlineCourseRes] = await Promise.all([
    supabase.from('trainer_profiles').select('id, slug, business_name, bio, city, specialties, languages, verified, profile_image_url, latitude, longitude').eq('verified', true).order('business_name'),
    supabase.from('services').select('id, trainer_id, title, description, price_nok, delivery_mode, active').eq('active', true),
    supabase.from('availability_slots').select('trainer_id, service_id, starts_at').eq('status', 'open').gt('starts_at', now).order('starts_at').limit(2000),
    supabase.from('reviews').select('trainer_id, rating').eq('moderation_status', 'visible'),
    supabase.from('group_offerings').select('id, trainer_id, kind, title, description, city, venue_name, is_online, price_nok, capacity, confirmed_count, tags, latitude, longitude').eq('active', true).is('completed_at', null),
    supabase.from('group_sessions').select('offering_id, starts_at, ends_at').gt('starts_at', now).order('starts_at').limit(3000),
    supabase.from('online_courses').select('id, trainer_id, slug, title, summary, description, cover_image_url, price_nok, tags, level, estimated_minutes').eq('published', true).order('published_at', { ascending: false }),
  ]);

  const trainers = (trainerRes.data || []) as TrainerRow[];
  const services = (serviceRes.data || []) as ServiceRow[];
  const slots = (slotRes.data || []) as SlotRow[];
  const reviews = (reviewRes.data || []) as ReviewRow[];
  const offerings = (offeringRes.data || []) as OfferingRow[];
  const sessions = (sessionRes.data || []) as SessionRow[];
  const onlineCourses = (onlineCourseRes.data || []) as OnlineCourseRow[];

  const q = params.q?.trim() || '';
  const place = params.place?.trim() || '';
  const specialty = params.specialty?.trim() || '';
  const type = params.type || 'all';
  const mode = params.mode || 'all';
  const when = params.when || 'any';
  const sort = params.sort || 'recommended';
  const maxPrice = numberParam(params.maxPrice);
  const minRating = numberParam(params.minRating);
  const userLat = numberParam(params.lat);
  const userLng = numberParam(params.lng);
  const radius = numberParam(params.radius) ?? 25;

  const dogKeywords: string[] = [];
  if (selectedDog?.birth_date) {
    const birth = new Date(`${selectedDog.birth_date}T12:00:00`);
    const months = Math.max(0, Math.floor((Date.now() - birth.getTime()) / (30.44 * 86400000)));
    if (months < 12) dogKeywords.push('valp');
    else if (months < 24) dogKeywords.push('unghund');
  }
  const dogNotes = normalise(selectedDog?.notes || '');
  const keywordRules: Array<[string[], string[]]> = [
    [['reaktiv','utager','passering'], ['reaktivitet','passering']],
    [['redd','usikker','frykt'], ['trygghet','frykt']],
    [['innkalling','kommer ikke'], ['innkalling']],
    [['trekker','band','bånd'], ['gå pent i bånd','bånd']],
    [['nosework','søk'], ['nosework']],
  ];
  keywordRules.forEach(([needles, terms]) => { if (needles.some((needle) => dogNotes.includes(normalise(needle)))) dogKeywords.push(...terms); });
  const uniqueDogKeywords = Array.from(new Set(dogKeywords));

  const reviewMap = new Map<string, ReviewRow[]>();
  reviews.forEach((review) => reviewMap.set(review.trainer_id, [...(reviewMap.get(review.trainer_id) || []), review]));
  const trainerMap = new Map(trainers.map((trainer) => [trainer.id, trainer]));

  const specialtyOptions = Array.from(new Set([
    ...trainers.flatMap((trainer) => trainer.specialties || []),
    ...offerings.flatMap((offering) => offering.tags || []),
    ...onlineCourses.flatMap((course) => course.tags || []),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nb'));

  let trainerResults = trainers.map((trainer) => {
    const trainerServices = services.filter((service) => service.trainer_id === trainer.id);
    const serviceIds = new Set(trainerServices.map((service) => service.id));
    const nextSlot = slots.find((slot) => slot.trainer_id === trainer.id && (!slot.service_id || serviceIds.has(slot.service_id)));
    const trainerReviews = reviewMap.get(trainer.id) || [];
    const ratingAverage = trainerReviews.length ? trainerReviews.reduce((sum, review) => sum + review.rating, 0) / trainerReviews.length : null;
    const prices = trainerServices.map((service) => service.price_nok);
    const distance = userLat != null && userLng != null && trainer.latitude != null && trainer.longitude != null
      ? distanceKm(userLat, userLng, Number(trainer.latitude), Number(trainer.longitude)) : null;
    const dogScore = uniqueDogKeywords.filter((keyword) => containsSearch([trainer.specialties || [], trainerServices.map((service) => `${service.title} ${service.description || ''}`)], keyword)).length;
    return { trainer, trainerServices, nextSlot, ratingAverage, reviewCount: trainerReviews.length, fromPrice: prices.length ? Math.min(...prices) : null, distance, dogScore };
  }).filter((item) => item.trainerServices.length > 0);

  trainerResults = trainerResults.filter((item) => {
    const { trainer, trainerServices, nextSlot, ratingAverage, fromPrice, distance } = item;
    if (q && !containsSearch([trainer.business_name, trainer.bio, trainer.city, trainer.specialties || [], trainer.languages || [], trainerServices.map((s) => `${s.title} ${s.description || ''}`)], q)) return false;
    if (place && !normalise(trainer.city).includes(normalise(place))) return false;
    if (specialty && !containsSearch([trainer.specialties || [], trainerServices.map((s) => `${s.title} ${s.description || ''}`)], specialty)) return false;
    if (mode === 'online' && !trainerServices.some((s) => ['online','both'].includes(s.delivery_mode))) return false;
    if (mode === 'in_person' && !trainerServices.some((s) => ['in_person','both'].includes(s.delivery_mode))) return false;
    if (maxPrice != null && (fromPrice == null || fromPrice > maxPrice)) return false;
    if (minRating != null && (ratingAverage == null || ratingAverage < minRating)) return false;
    if (userLat != null && userLng != null && params.radius && (distance == null || distance > radius)) return false;
    if (when === '7d' && !withinDays(nextSlot?.starts_at, 7)) return false;
    if (when === '30d' && !withinDays(nextSlot?.starts_at, 30)) return false;
    return true;
  });

  trainerResults.sort((a, b) => {
    if (sort === 'nearest') return (a.distance ?? 99999) - (b.distance ?? 99999);
    if (sort === 'rating') return (b.ratingAverage ?? -1) - (a.ratingAverage ?? -1);
    if (sort === 'price') return (a.fromPrice ?? 999999) - (b.fromPrice ?? 999999);
    if (sort === 'soon') return (a.nextSlot?.starts_at || '9999').localeCompare(b.nextSlot?.starts_at || '9999');
    return b.dogScore - a.dogScore || Number(b.trainer.verified) - Number(a.trainer.verified) || (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
  });

  let activityResults: ActivityResult[] = offerings.map((offering) => {
    const activitySessions = sessions.filter((session) => session.offering_id === offering.id);
    const trainer = trainerMap.get(offering.trainer_id);
    const trainerReviews = reviewMap.get(offering.trainer_id) || [];
    const ratingAverage = trainerReviews.length ? trainerReviews.reduce((sum, review) => sum + review.rating, 0) / trainerReviews.length : null;
    const lat = offering.latitude ?? trainer?.latitude ?? null;
    const lng = offering.longitude ?? trainer?.longitude ?? null;
    const distance = userLat != null && userLng != null && lat != null && lng != null ? distanceKm(userLat, userLng, Number(lat), Number(lng)) : null;
    const dogScore = uniqueDogKeywords.filter((keyword) => containsSearch([offering.tags || [], offering.title, offering.description], keyword)).length;
    return activitySessions.length ? { offering, firstSession: activitySessions[0], sessionCount: activitySessions.length, trainer, ratingAverage, reviewCount: trainerReviews.length, distance, dogScore } : null;
  }).filter((value): value is ActivityResult => Boolean(value));

  activityResults = activityResults.filter((item) => {
    const { offering, trainer, ratingAverage, distance, firstSession } = item;
    if (q && !containsSearch([offering.title, offering.description, offering.city, offering.venue_name, offering.tags || [], trainer?.business_name, trainer?.specialties || []], q)) return false;
    if (place && !normalise(offering.city).includes(normalise(place))) return false;
    if (specialty && !containsSearch([offering.tags || [], offering.title, offering.description], specialty)) return false;
    if (mode === 'online' && !offering.is_online) return false;
    if (mode === 'in_person' && offering.is_online) return false;
    if (maxPrice != null && offering.price_nok > maxPrice) return false;
    if (minRating != null && (ratingAverage == null || ratingAverage < minRating)) return false;
    if (userLat != null && userLng != null && params.radius && !offering.is_online && (distance == null || distance > radius)) return false;
    if (when === '7d' && !withinDays(firstSession.starts_at, 7)) return false;
    if (when === '30d' && !withinDays(firstSession.starts_at, 30)) return false;
    if (type === 'course' && offering.kind !== 'course') return false;
    if (type === 'event' && offering.kind !== 'event') return false;
    return true;
  });

  activityResults.sort((a, b) => {
    if (sort === 'nearest') return (a.distance ?? 99999) - (b.distance ?? 99999);
    if (sort === 'rating') return (b.ratingAverage ?? -1) - (a.ratingAverage ?? -1);
    if (sort === 'price') return a.offering.price_nok - b.offering.price_nok;
    return b.dogScore - a.dogScore || a.firstSession.starts_at.localeCompare(b.firstSession.starts_at);
  });

  let onlineCourseResults: OnlineCourseResult[] = onlineCourses.map((course) => {
    const trainer = trainerMap.get(course.trainer_id);
    const trainerReviews = reviewMap.get(course.trainer_id) || [];
    const ratingAverage = trainerReviews.length ? trainerReviews.reduce((sum, review) => sum + review.rating, 0) / trainerReviews.length : null;
    const dogScore = uniqueDogKeywords.filter((keyword) => containsSearch([course.tags || [], course.title, course.summary, course.description], keyword)).length;
    return { course, trainer, ratingAverage, reviewCount: trainerReviews.length, dogScore };
  }).filter((item) => {
    const { course, trainer, ratingAverage } = item;
    if (q && !containsSearch([course.title, course.summary, course.description, course.tags || [], trainer?.business_name, trainer?.specialties || []], q)) return false;
    if (specialty && !containsSearch([course.tags || [], course.title, course.summary], specialty)) return false;
    if (mode === 'in_person') return false;
    if (maxPrice != null && course.price_nok > maxPrice) return false;
    if (minRating != null && (ratingAverage == null || ratingAverage < minRating)) return false;
    return true;
  });

  onlineCourseResults.sort((a,b) => {
    if (sort === 'rating') return (b.ratingAverage ?? -1) - (a.ratingAverage ?? -1);
    if (sort === 'price') return a.course.price_nok - b.course.price_nok;
    return b.dogScore - a.dogScore || (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
  });

  const showTrainers = ['all','trainers','private'].includes(type);
  const showActivities = ['all','activities','course','event'].includes(type);
  const showOnlineCourses = ['all','online'].includes(type);
  const totalResults = (showTrainers ? trainerResults.length : 0) + (showActivities ? activityResults.length : 0) + (showOnlineCourses ? onlineCourseResults.length : 0);
  const activeFilterCount = [q, place, specialty, params.dog, mode !== 'all' ? mode : '', params.radius && userLat != null ? params.radius : '', params.maxPrice, params.minRating, when !== 'any' ? when : ''].filter(Boolean).length;

  return (
    <main className="page-shell discovery-page">
      <section className="page-heading discovery-heading">
        <span className="eyebrow">Oppdag</span>
        <h1>Finn riktig trening for hunden din</h1>
        <p className="muted">Søk i hundetrenere, privattimer, kurs, arrangementer og nettkurs på ett sted.</p>
      </section>

      <form className="discovery-filter-panel" method="get">
        <div className="discovery-primary-search">
          <label className="discovery-search-wide">Hva leter du etter?<input name="q" defaultValue={q} placeholder="Valpekurs, reaktivitet, nosework…" /></label>
          <label>Sted<input name="place" defaultValue={place} placeholder="Hamar" /></label>
          <button className="btn" type="submit">Søk</button>
        </div>
        <details className="discovery-advanced" open={Boolean(specialty || params.dog || mode !== 'all' || params.maxPrice || params.minRating || when !== 'any' || params.lat || (params.sort && params.sort !== 'recommended'))}>
        <summary>Tilpass søket <span>Type, pris, tidspunkt og avstand</span></summary>
        <div className="discovery-filter-grid">
          <label>Vis<select name="type" defaultValue={type}><option value="all">Alt</option><option value="trainers">Hundetrenere</option><option value="private">Privattimer</option><option value="activities">Kurs og aktiviteter</option><option value="course">Kurs</option><option value="event">Arrangementer</option><option value="online">Nettkurs</option></select></label>
          <label>Emne<select name="specialty" defaultValue={specialty}><option value="">Alle emner</option>{specialtyOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          {dogs.length ? <label>Finn for hund<select name="dog" defaultValue={params.dog || ''}><option value="">Ingen bestemt hund</option>{dogs.map((dog) => <option value={dog.id} key={dog.id}>{dog.name}{dog.breed ? ` · ${dog.breed}` : ''}</option>)}</select></label> : null}
          <label>Format<select name="mode" defaultValue={mode}><option value="all">Fysisk og på nett</option><option value="in_person">Fysisk</option><option value="online">På nett</option></select></label>
          <label>Når<select name="when" defaultValue={when}><option value="any">Når som helst</option><option value="7d">Neste 7 dager</option><option value="30d">Neste 30 dager</option></select></label>
          <label>Makspris<input name="maxPrice" type="number" min="0" step="100" defaultValue={params.maxPrice || ''} placeholder="Ingen grense" /></label>
          <label>Min. vurdering<select name="minRating" defaultValue={params.minRating || ''}><option value="">Alle</option><option value="4">4,0+</option><option value="4.5">4,5+</option><option value="4.8">4,8+</option></select></label>
          <label>Avstand<select name="radius" defaultValue={params.radius || '25'}><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option></select></label>
          <label>Sorter<select name="sort" defaultValue={sort}><option value="recommended">Anbefalt</option><option value="soon">Starter/ledig snart</option><option value="nearest">Nærmest</option><option value="rating">Beste vurdering</option><option value="price">Laveste pris</option></select></label>
        </div>
        <div className="discovery-location-row">
          <LocationFields initialLat={params.lat} initialLng={params.lng} latName="lat" lngName="lng" compact />
          {userLat != null && userLng != null ? <span className="location-active-pill">Avstandsfilter klart</span> : <span className="muted small">Trykk «Bruk min posisjon» for å bruke km-filteret.</span>}
          {activeFilterCount ? <Link className="text-link discovery-clear" href="/discover">Nullstill {activeFilterCount} filtre</Link> : null}
        </div>
        <button className="btn compact" type="submit">Vis treff</button>
        </details>
      </form>

      <div className="discovery-summary">
        <div><strong>{totalResults} treff</strong><span className="muted small">{selectedDog ? ` anbefalt for ${selectedDog.name}` : q ? ` for «${q}»` : ' i markedsplassen'}</span></div>
        <div className="discovery-tabs">
          <Link className={type === 'all' ? 'active' : ''} href={buildQuery(params, { type: 'all' })}>Alt</Link>
          <Link className={['trainers','private'].includes(type) ? 'active' : ''} href={buildQuery(params, { type: 'trainers' })}>Trenere</Link>
          <Link className={['course', 'activities'].includes(type) ? 'active' : ''} href={buildQuery(params, { type: 'course' })}>Kurs</Link>
          <Link className={type === 'event' ? 'active' : ''} href={buildQuery(params, { type: 'event' })}>Arrangementer</Link>
          <Link className={type === 'online' ? 'active' : ''} href={buildQuery(params, { type: 'online' })}>Nettkurs</Link>
        </div>
      </div>

      {type === 'all' && totalResults === 0 ? <div className="empty-state"><h2>Ingen treff akkurat n?</h2><p className="muted">Pr?v et annet sted eller emne, eller fjern noen filtre.</p><Link className="btn secondary" href="/discover">Nullstill s?ket</Link></div> : null}

      {showTrainers && (type !== 'all' || trainerResults.length > 0) ? <section className="discovery-section">
        <div className="section-title"><div><span className="eyebrow">Hundetrenere</span><h2>{trainerResults.length ? `${trainerResults.length} aktuelle trenere` : 'Ingen trenere matcher'}</h2></div>{type === 'all' && trainerResults.length > 3 ? <Link className="text-link" href={buildQuery(params, { type: 'trainers' })}>Se alle →</Link> : null}</div>
        {trainerResults.length ? <div className="results-list">{trainerResults.slice(0, type === 'all' ? 3 : undefined).map((item) => {
          const data: TrainerCardData = {
            id: item.trainer.id,
            slug: item.trainer.slug,
            name: item.trainer.business_name,
            city: item.trainer.city,
            specialties: item.trainer.specialties || [],
            bio: item.trainer.bio || '',
            verified: item.trainer.verified,
            profileImageUrl: item.trainer.profile_image_url,
            fromPrice: item.fromPrice,
            nextAvailable: item.nextSlot?.starts_at || null,
            ratingAverage: item.ratingAverage,
            reviewCount: item.reviewCount,
            demoMeta: formatDistance(item.distance),
          };
          return <TrainerCard trainer={data} saveState={showSave ? { saved: savedSet.has(`trainer:${item.trainer.id}`), canSave, returnPath } : null} key={item.trainer.id} />;
        })}</div> : <div className="empty-state"><h3>Prøv et litt bredere søk</h3><p className="muted">Fjern et filter, øk avstanden eller søk etter et annet emne.</p></div>}
      </section> : null}

      {showOnlineCourses && (type !== 'all' || onlineCourseResults.length > 0) ? <section className="discovery-section">
        <div className="section-title"><div><span className="eyebrow">Nettkurs</span><h2>{onlineCourseResults.length ? `${onlineCourseResults.length} kurs du kan starte nå` : 'Ingen nettkurs matcher'}</h2></div>{type === 'all' && onlineCourseResults.length > 4 ? <Link className="text-link" href={buildQuery(params, { type: 'online' })}>Se alle →</Link> : null}</div>
        {onlineCourseResults.length ? <div className="online-course-grid">{onlineCourseResults.slice(0, type === 'all' ? 4 : undefined).map((item) => <div className="online-course-card-wrap" key={item.course.id}>{showSave ? <SaveButton itemType="online_course" itemId={item.course.id} saved={savedSet.has(`online_course:${item.course.id}`)} canSave={canSave} returnPath={returnPath} /> : null}<Link href={`/online-courses/${item.course.slug}`} className="online-course-card">{item.course.cover_image_url ? <img src={item.course.cover_image_url} alt="" /> : <div className="course-cover-placeholder">▶</div>}<div className="online-course-card-body"><span className="eyebrow">Nettkurs</span><h2>{item.course.title}</h2><p className="muted">{item.course.summary || 'Lær i ditt eget tempo.'}</p><div className="chips">{(item.course.tags || []).slice(0,3).map(tag => <span className="chip" key={tag}>{tag}</span>)}</div><div className="online-course-card-footer"><span>{item.trainer?.business_name || 'Hundetrener'}{item.reviewCount ? ` · ★ ${item.ratingAverage?.toFixed(1)}` : ''}</span><strong>{money(item.course.price_nok)}</strong></div></div></Link></div>)}</div> : <div className="empty-state"><h3>Ingen nettkurs akkurat nå</h3><p className="muted">Prøv et annet søk eller fjern et filter.</p></div>}
      </section> : null}

      {showActivities && (type !== 'all' || activityResults.length > 0) ? <section className="discovery-section">
        <div className="section-title"><div><span className="eyebrow">Kurs og arrangementer</span><h2>{activityResults.length ? `${activityResults.length} kommende aktiviteter` : 'Ingen aktiviteter matcher'}</h2></div>{type === 'all' && activityResults.length > 6 ? <Link className="text-link" href={buildQuery(params, { type: 'activities' })}>Se alle →</Link> : null}</div>
        {activityResults.length ? <div className="activity-grid">{activityResults.slice(0, type === 'all' ? 6 : undefined).map((item) => {
          const remaining = Math.max(0, item.offering.capacity - item.offering.confirmed_count);
          return <div className="activity-card-wrap" key={item.offering.id}>{showSave ? <SaveButton itemType="activity" itemId={item.offering.id} saved={savedSet.has(`activity:${item.offering.id}`)} canSave={canSave} returnPath={returnPath} /> : null}<Link href={`/activities/${item.offering.id}`} className="activity-card">
            <div className="activity-card-top"><span className={`activity-kind ${item.offering.kind}`}>{item.offering.kind === 'course' ? 'Kurs' : 'Arrangement'}</span>{remaining <= 2 ? <span className="places-warning">{remaining === 0 ? 'Fullt' : `${remaining} plasser igjen`}</span> : <span className="muted small">{remaining} ledige</span>}</div>
            <h2>{item.offering.title}</h2>
            <p className="muted activity-card-date">{formatOsloDateTime(item.firstSession.starts_at)}</p>
            <p className="muted">{item.offering.is_online ? 'På nett' : [item.offering.venue_name, item.offering.city, formatDistance(item.distance)].filter(Boolean).join(' · ')}</p>
            {(item.offering.tags || []).length ? <div className="chips">{(item.offering.tags || []).slice(0,3).map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div> : null}
            {item.sessionCount > 1 ? <span className="activity-session-count">{item.sessionCount} samlinger</span> : null}
            <div className="activity-card-footer"><div className="activity-trainer-mini">{item.trainer?.profile_image_url ? <img src={item.trainer.profile_image_url} alt="" /> : <span>{item.trainer?.business_name?.slice(0,1) || 'H'}</span>}<div><strong>{item.trainer?.business_name || 'Hundetrener'} {item.trainer?.verified ? '✓' : ''}</strong><small>{item.reviewCount ? `★ ${item.ratingAverage?.toFixed(1)} (${item.reviewCount})` : 'Arrangør'}</small></div></div><strong className="activity-price">{money(item.offering.price_nok)}</strong></div>
          </Link></div>;
        })}</div> : <div className="empty-state"><h3>Ingen kurs eller arrangementer akkurat nå</h3><p className="muted">Prøv en annen dato, et annet sted eller fjern et filter.</p></div>}
      </section> : null}
    </main>
  );
}
