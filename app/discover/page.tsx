import Link from 'next/link';
import { ArrowRight, MapPin, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { DiscoveryCard } from '@/components/discovery-card';
import { DiscoveryFilters, DiscoverySort } from '@/components/discovery-controls';
import { LocationFields } from '@/components/location-fields';
import './discover.css';
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
  const type = ['all', 'trainers', 'private', 'activities', 'course', 'event', 'online'].includes(params.type || '') ? params.type! : 'all';
  const mode = params.mode || 'all';
  const when = params.when || 'any';
  const requestedSort = ['recommended', 'price', 'rating', 'soon', 'nearest'].includes(params.sort || '') ? params.sort! : 'recommended';
  const maxPrice = numberParam(params.maxPrice);
  const minRating = numberParam(params.minRating);
  const userLat = numberParam(params.lat);
  const userLng = numberParam(params.lng);
  const radius = numberParam(params.radius) ?? 25;
  const sort = (requestedSort === 'nearest' && (userLat == null || userLng == null)) || (type === 'online' && ['nearest', 'soon'].includes(requestedSort)) ? 'recommended' : requestedSort;

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
    const trainerServices = services.filter((service) => service.trainer_id === trainer.id
      && (mode !== 'online' || ['online', 'both'].includes(service.delivery_mode))
      && (mode !== 'in_person' || ['in_person', 'both'].includes(service.delivery_mode))
      && (maxPrice == null || service.price_nok <= maxPrice));
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
    if (userLat != null && userLng != null && (distance == null || distance > radius)) return false;
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
    if (userLat != null && userLng != null && !offering.is_online && (distance == null || distance > radius)) return false;
    if (when === '7d' && !withinDays(firstSession.starts_at, 7)) return false;
    if (when === '30d' && !withinDays(firstSession.starts_at, 30)) return false;
    return true;
  });

  activityResults.sort((a, b) => {
    if (sort === 'nearest') return (a.distance ?? 99999) - (b.distance ?? 99999);
    if (sort === 'rating') return (b.ratingAverage ?? -1) - (a.ratingAverage ?? -1);
    if (sort === 'price') return a.offering.price_nok - b.offering.price_nok;
    return b.dogScore - a.dogScore || a.firstSession.starts_at.localeCompare(b.firstSession.starts_at);
  });

  const courseCount = activityResults.filter(item => item.offering.kind === 'course').length;
  const eventCount = activityResults.filter(item => item.offering.kind === 'event').length;
  if (type === 'course' || type === 'event') activityResults = activityResults.filter(item => item.offering.kind === type);

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
  const activeChips: { label: string; clear: Record<string, string | undefined> }[] = [];
  if (q) activeChips.push({ label: `Søk: ${q}`, clear: { q: undefined } });
  if (place) activeChips.push({ label: place, clear: { place: undefined } });
  if (specialty) activeChips.push({ label: specialty, clear: { specialty: undefined } });
  if (selectedDog) activeChips.push({ label: selectedDog.name, clear: { dog: undefined } });
  if (mode !== 'all') activeChips.push({ label: mode === 'online' ? 'På nett' : 'Fysisk oppmøte', clear: { mode: undefined } });
  if (maxPrice != null) activeChips.push({ label: `Maks ${money(maxPrice)}`, clear: { maxPrice: undefined } });
  if (minRating != null) activeChips.push({ label: `${minRating.toFixed(1).replace('.', ',')}+ stjerner`, clear: { minRating: undefined } });
  if (when !== 'any') activeChips.push({ label: when === '7d' ? 'Neste 7 dager' : 'Neste 30 dager', clear: { when: undefined } });
  if (userLat != null && userLng != null) activeChips.push({ label: `Innen ${radius} km`, clear: { lat: undefined, lng: undefined, radius: undefined, sort: sort === 'nearest' ? undefined : sort } });
  const filterCount = activeChips.length - Number(Boolean(q)) - Number(Boolean(place));
  const resetPath = buildQuery({ type }, {});
  const categories = [
    { value: 'all', label: 'Alt', count: trainerResults.length + courseCount + eventCount + onlineCourseResults.length },
    { value: 'trainers', label: 'Trenere', count: trainerResults.length },
    { value: 'course', label: 'Kurs', count: courseCount },
    { value: 'event', label: 'Arrangementer', count: eventCount },
    { value: 'online', label: 'Nettkurs', count: onlineCourseResults.length },
  ];
  const queryFailed = Boolean(trainerRes.error || serviceRes.error || slotRes.error || reviewRes.error || offeringRes.error || sessionRes.error || onlineCourseRes.error);
  const saveState = (kind: string, id: string) => showSave ? { saved: savedSet.has(`${kind}:${id}`), canSave, returnPath } : null;

  return (
    <main className="page-shell discover-page">
      <header className="discover-heading"><h1>Finn hundetrening</h1><p>Privattimer, kurs og aktiviteter som passer deg og hunden din.</p></header>
      <form key={returnPath} id="discover-search" action="/discover" method="get" className="discover-search" role="search" aria-label="Søk etter hundetrening">
        <input type="hidden" name="type" value={type} />
        <label><Search size={20} aria-hidden="true" /><span>Hva leter du etter?</span><input name="q" defaultValue={q} placeholder="Emne, kurs eller trener" /></label>
        <label><MapPin size={20} aria-hidden="true" /><span>Hvor?</span><input name="place" defaultValue={place} placeholder="By eller sted" /></label>
        <button className="btn" type="submit"><Search size={18} aria-hidden="true" /> Søk</button>
      </form>
      <nav className="discover-categories" aria-label="Velg type trening">
        {categories.map(category => {
          const active = category.value === type || (category.value === 'trainers' && type === 'private');
          return <Link key={category.value} href={buildQuery(params, { type: category.value })} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>{category.label}<span>{category.count}</span></Link>;
        })}
        {type === 'activities' && <Link className="is-active" aria-current="page" href={returnPath}>Kurs og aktiviteter<span>{courseCount + eventCount}</span></Link>}
      </nav>

      <div className="discover-layout">
        <DiscoveryFilters key={returnPath} count={filterCount}>
          <div className="discover-filter-heading"><h2><SlidersHorizontal size={17} aria-hidden="true" /> Filtre</h2>{activeChips.length > 0 && <Link href={resetPath}>Nullstill</Link>}</div>
          <div className="discover-filter-group">
            <label>Emne<select form="discover-search" name="specialty" defaultValue={specialty}><option value="">Alle emner</option>{specialtyOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            {dogs.length > 0 && <label>Tilpass til hunden din<select form="discover-search" name="dog" defaultValue={params.dog || ''}><option value="">Ingen bestemt hund</option>{dogs.map(dog => <option value={dog.id} key={dog.id}>{dog.name}</option>)}</select></label>}
            <label>Treningsform<select form="discover-search" name="mode" defaultValue={mode}><option value="all">Fysisk og på nett</option><option value="in_person">Fysisk oppmøte</option><option value="online">På nett</option></select></label>
            <label>Oppstart / ledig time<select form="discover-search" name="when" defaultValue={when}><option value="any">Når som helst</option><option value="7d">Neste 7 dager</option><option value="30d">Neste 30 dager</option></select><small>Nettkurs kan tas i eget tempo.</small></label>
          </div>
          <div className="discover-filter-group">
            <label>Makspris (kr)<input form="discover-search" name="maxPrice" type="number" min="0" step="1" defaultValue={params.maxPrice || ''} placeholder="Ingen grense" /></label>
            <label>Vurdering<select form="discover-search" name="minRating" defaultValue={params.minRating || ''}><option value="">Alle vurderinger</option><option value="4">4,0 stjerner eller mer</option><option value="4.5">4,5 stjerner eller mer</option><option value="4.8">4,8 stjerner eller mer</option></select></label>
          </div>
          <div className="discover-filter-group">
            <label>Avstand<select form="discover-search" name="radius" defaultValue={params.radius || '25'}><option value="10">Innen 10 km</option><option value="25">Innen 25 km</option><option value="50">Innen 50 km</option><option value="100">Innen 100 km</option></select></label>
            <LocationFields key={`${params.lat}:${params.lng}`} formId="discover-search" initialLat={params.lat} initialLng={params.lng} latName="lat" lngName="lng" compact />
          </div>
          <button className="btn discover-apply" form="discover-search" type="submit">Vis resultater <ArrowRight size={16} aria-hidden="true" /></button>
        </DiscoveryFilters>

        <div className="discover-results">
          <div className="discover-results-toolbar"><p><strong>{totalResults} treff</strong>{selectedDog ? <span> tilpasset {selectedDog.name}</span> : place ? <span> · {place}</span> : null}</p><DiscoverySort value={sort} returnPath={returnPath} hasLocation={userLat != null && userLng != null} onlineOnly={type === 'online'} /></div>
          {activeChips.length > 0 && <div className="discover-active-filters" aria-label="Aktive filtre">{activeChips.map(chip => <Link key={Object.keys(chip.clear)[0]} href={buildQuery(params, chip.clear)} aria-label={`Fjern filter: ${chip.label}`}>{chip.label}<X size={13} aria-hidden="true" /></Link>)}<Link className="discover-clear" href={resetPath}>Nullstill alle</Link></div>}
          {queryFailed && <div className="discover-error" role="alert"><strong>Vi kunne ikke hente alle resultatene.</strong><p>Prøv igjen om litt. Noen treff kan mangle.</p><Link href={returnPath}>Prøv igjen</Link></div>}
          {totalResults === 0 && !queryFailed && <div className="discover-empty"><SearchX size={32} strokeWidth={1.5} aria-hidden="true" /><h2>Ingen treff{q ? ` for «${q}»` : ''}</h2><p>Prøv et annet sted eller emne, eller fjern et filter for å se flere alternativer.</p><Link className="btn secondary" href={resetPath}>Nullstill søket</Link></div>}

          {showTrainers && trainerResults.length > 0 && <section className="discover-result-section" aria-labelledby="discover-trainers"><div className="discover-section-heading"><h2 id="discover-trainers">Hundetrenere <span>{trainerResults.length}</span></h2>{type === 'all' && trainerResults.length > 4 && <Link href={buildQuery(params, { type: 'trainers' })}>Se alle trenere <ArrowRight size={15} aria-hidden="true" /></Link>}</div><div className="discover-card-grid">{trainerResults.slice(0, type === 'all' ? 4 : undefined).map(item => <DiscoveryCard key={item.trainer.id} id={item.trainer.id} kind="trainer" category="Privattimer" title={item.trainer.business_name} href={`/trainers/${item.trainer.slug}`} image={item.trainer.profile_image_url} description={item.trainer.bio || 'Personlig veiledning for deg og hunden din.'} location={[item.trainer.city, formatDistance(item.distance)].filter(Boolean).join(' · ')} detail={item.nextSlot ? `Ledig ${formatOsloDateTime(item.nextSlot.starts_at)}` : 'Se tilgjengelighet hos trener'} price={item.fromPrice} rating={item.ratingAverage} reviewCount={item.reviewCount} verified={item.trainer.verified} tags={item.trainer.specialties || []} save={saveState('trainer', item.trainer.id)} />)}</div></section>}

          {showActivities && activityResults.length > 0 && <section className="discover-result-section" aria-labelledby="discover-activities"><div className="discover-section-heading"><h2 id="discover-activities">{type === 'event' ? 'Arrangementer' : type === 'course' ? 'Kurs' : 'Kurs og aktiviteter'} <span>{activityResults.length}</span></h2>{type === 'all' && activityResults.length > 4 && <Link href={buildQuery(params, { type: 'activities' })}>Se alle aktiviteter <ArrowRight size={15} aria-hidden="true" /></Link>}</div><div className="discover-card-grid">{activityResults.slice(0, type === 'all' ? 4 : undefined).map(item => {
            const remaining = Math.max(0, item.offering.capacity - item.offering.confirmed_count);
            return <DiscoveryCard key={item.offering.id} id={item.offering.id} kind="activity" category={item.offering.kind === 'course' ? 'Kurs' : 'Arrangement'} title={item.offering.title} href={`/activities/${item.offering.id}`} description={item.offering.description || (item.sessionCount > 1 ? `${item.sessionCount} samlinger med veiledning fra trener.` : 'En aktivitet for deg og hunden din.')} location={item.offering.is_online ? 'På nett' : [item.offering.venue_name, item.offering.city, formatDistance(item.distance)].filter(Boolean).join(' · ')} detail={`${formatOsloDateTime(item.firstSession.starts_at)}${item.sessionCount > 1 ? ` · ${item.sessionCount} samlinger` : ''}`} provider={item.trainer?.business_name || 'Hundetrener'} price={item.offering.price_nok} rating={item.ratingAverage} reviewCount={item.reviewCount} tags={item.offering.tags || []} availability={remaining === 0 ? 'Fullbooket' : `${remaining} ${remaining === 1 ? 'ledig plass' : 'ledige plasser'}`} full={remaining === 0} save={saveState('activity', item.offering.id)} />;
          })}</div></section>}

          {showOnlineCourses && onlineCourseResults.length > 0 && <section className="discover-result-section" aria-labelledby="discover-online"><div className="discover-section-heading"><h2 id="discover-online">Nettkurs <span>{onlineCourseResults.length}</span></h2>{type === 'all' && onlineCourseResults.length > 4 && <Link href={buildQuery(params, { type: 'online' })}>Se alle nettkurs <ArrowRight size={15} aria-hidden="true" /></Link>}</div><div className="discover-card-grid">{onlineCourseResults.slice(0, type === 'all' ? 4 : undefined).map(item => <DiscoveryCard key={item.course.id} id={item.course.id} kind="online_course" category="Nettkurs" title={item.course.title} href={`/online-courses/${item.course.slug}`} image={item.course.cover_image_url} description={item.course.summary || 'Lær i ditt eget tempo, når det passer deg.'} location="På nett · Tilgjengelig overalt" detail={item.course.estimated_minutes > 0 ? `Ca. ${item.course.estimated_minutes} minutter` : 'I ditt eget tempo'} provider={item.trainer?.business_name || 'Hundetrener'} price={item.course.price_nok} rating={item.ratingAverage} reviewCount={item.reviewCount} tags={item.course.tags || []} availability="Start når du vil" save={saveState('online_course', item.course.id)} />)}</div></section>}
        </div>
      </div>
    </main>
  );
}
