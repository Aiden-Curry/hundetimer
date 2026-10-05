import Link from 'next/link';
import { ArrowLeft, ArrowRight, Search, SearchX, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DiscoveryCard } from '@/components/discovery-card';
import { CourseSort } from '@/components/course-sort';
import { DiscoveryFilters } from '@/components/discovery-controls';
import { containsSearch, normalise, numberParam } from '@/lib/discovery';
import '../discover/discover.css';
import './catalogue.css';

export const metadata = { title: 'Nettkurs i hundetrening', description: 'Finn nettkurs i hundetrening. Sammenlign emner, nivå, varighet og pris, og lær i ditt eget tempo.' };

type Params = { q?: string; topic?: string; level?: string; duration?: string; maxPrice?: string; sort?: string; page?: string };
type Course = { id: string; slug: string; title: string; summary: string | null; cover_image_url: string | null; price_nok: number; tags: string[] | null; level: string; estimated_minutes: number; trainer_id: string };
const levels: Record<string, string> = { all: 'Alle nivåer', beginner: 'Nybegynner', intermediate: 'Viderekommen', advanced: 'Avansert' };
function query(params: Params, overrides: Partial<Record<keyof Params, string | undefined>> = {}) {
  const search = new URLSearchParams();
  Object.entries({ ...params, ...overrides }).forEach(([key, value]) => { if (value && value !== 'newest') search.set(key, value); });
  return '/online-courses' + (search.size ? `?${search}` : '');
}
function durationLabel(minutes: number) {
  if (!minutes) return 'Varighet ikke oppgitt';
  if (minutes < 60) return `Ca. ${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `Ca. ${hours} ${hours === 1 ? 'time' : 'timer'}${rest ? ` ${rest} min` : ''}`;
}

export default async function OnlineCoursesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const params: Params = {
    q: raw.q?.trim() || undefined, topic: raw.topic?.trim() || undefined,
    level: raw.level && Object.hasOwn(levels, raw.level) ? raw.level : undefined,
    duration: ['short', 'medium', 'long'].includes(raw.duration || '') ? raw.duration : undefined,
    maxPrice: numberParam(raw.maxPrice) != null && Number(raw.maxPrice) >= 0 ? raw.maxPrice : undefined,
    sort: ['price', 'price_desc', 'duration'].includes(raw.sort || '') ? raw.sort : 'newest',
  };
  const supabase = await createClient();
  const [{ data: { user } }, courseResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('online_courses').select('id,slug,title,summary,cover_image_url,price_nok,tags,level,estimated_minutes,trainer_id').eq('published', true).order('published_at', { ascending: false }),
  ]);
  const courses = (courseResult.data || []) as Course[];
  const trainerIds = [...new Set(courses.map(course => course.trainer_id))];
  const [{ data: viewerProfile }, trainerResult] = await Promise.all([
    user ? supabase.from('profiles').select('role').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    trainerIds.length ? supabase.from('trainer_profiles').select('id,business_name,slug').in('id', trainerIds).eq('verified', true) : Promise.resolve({ data: [], error: null }),
  ]);
  const canSave = Boolean(user) && viewerProfile?.role !== 'admin';
  const { data: savedRows } = canSave ? await supabase.from('saved_items').select('item_id').eq('owner_id', user!.id).eq('item_type', 'online_course') : { data: [] as { item_id: string }[] };
  const saved = new Set((savedRows || []).map(row => row.item_id));
  const trainers = new Map((trainerResult.data || []).map(trainer => [trainer.id, trainer]));
  const topics = [...new Set(courses.flatMap(course => course.tags || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
  const maxPrice = numberParam(params.maxPrice);
  const filtered = courses.filter(course => {
    if (params.q && !containsSearch([course.title, course.summary, course.tags || [], trainers.get(course.trainer_id)?.business_name], params.q)) return false;
    if (params.topic && !(course.tags || []).some(tag => normalise(tag) === normalise(params.topic))) return false;
    if (params.level && course.level !== params.level) return false;
    if (maxPrice != null && course.price_nok > maxPrice) return false;
    if (params.duration === 'short' && !(course.estimated_minutes > 0 && course.estimated_minutes <= 60)) return false;
    if (params.duration === 'medium' && !(course.estimated_minutes > 60 && course.estimated_minutes <= 180)) return false;
    if (params.duration === 'long' && !(course.estimated_minutes > 180)) return false;
    return true;
  });
  if (params.sort === 'price') filtered.sort((a, b) => a.price_nok - b.price_nok);
  if (params.sort === 'price_desc') filtered.sort((a, b) => b.price_nok - a.price_nok);
  if (params.sort === 'duration') filtered.sort((a, b) => (a.estimated_minutes || Infinity) - (b.estimated_minutes || Infinity));
  const chips: { key: keyof Params; label: string }[] = [];
  if (params.q) chips.push({ key: 'q', label: `Søk: ${params.q}` });
  if (params.topic) chips.push({ key: 'topic', label: params.topic });
  if (params.level) chips.push({ key: 'level', label: levels[params.level] });
  if (params.duration) chips.push({ key: 'duration', label: { short: 'Inntil 1 time', medium: '1–3 timer', long: 'Over 3 timer' }[params.duration]! });
  if (params.maxPrice) chips.push({ key: 'maxPrice', label: `Maks ${new Intl.NumberFormat('nb-NO').format(Number(params.maxPrice))} kr` });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const page = Math.min(pageCount, Math.max(1, Math.floor(numberParam(raw.page) || 1)));
  const visible = filtered.slice((page - 1) * 12, page * 12);
  const returnPath = query(params, { page: page > 1 ? String(page) : undefined });
  const error = courseResult.error || trainerResult.error;

  return <main className="page-shell course-catalogue">
    <header className="catalogue-heading"><h1>Nettkurs i hundetrening</h1><p>Finn et kurs som passer dere, og lær hjemme i eget tempo.</p></header>
    <form key={returnPath} action="/online-courses" method="get" className="catalogue-search-form" role="search" aria-label="Søk i nettkurs">
      <input type="hidden" name="sort" value={params.sort} /><div className="catalogue-search"><label><Search size={20} aria-hidden="true" /><span className="discover-sr-only">Søk etter kurs, emne eller trener</span><input name="q" defaultValue={params.q || ''} placeholder="Søk etter kurs, emne eller trener" /></label><button className="btn" type="submit">Søk<ArrowRight size={17} aria-hidden="true" /></button></div>
      <DiscoveryFilters count={chips.filter(chip => chip.key !== 'q').length}>
        <div className="catalogue-filter-grid">
          <label>Emne<select name="topic" defaultValue={params.topic || ''}><option value="">Alle emner</option>{params.topic && !topics.includes(params.topic) && <option value={params.topic}>{params.topic}</option>}{topics.map(topic => <option key={topic} value={topic}>{topic}</option>)}</select></label>
          <label>Nivå<select name="level" defaultValue={params.level || ''}><option value="">Alle kurs</option>{Object.entries(levels).map(([value, label]) => <option value={value} key={value}>{value === 'all' ? 'Passer alle nivåer' : label}</option>)}</select></label>
          <label>Estimert varighet<select name="duration" defaultValue={params.duration || ''}><option value="">Alle varigheter</option><option value="short">Inntil 1 time</option><option value="medium">1–3 timer</option><option value="long">Over 3 timer</option></select></label>
          <label>Makspris (kr)<input name="maxPrice" type="number" min="0" step="1" defaultValue={params.maxPrice || ''} placeholder="Ingen grense" /></label>
          <button className="btn secondary catalogue-apply" type="submit">Vis kurs</button>
        </div>
      </DiscoveryFilters>
    </form>
    <div className="catalogue-results-toolbar"><p><strong>{filtered.length} nettkurs</strong>{chips.length > 0 && <span> som matcher søket</span>}</p><form key={returnPath} action="/online-courses" method="get" className="catalogue-sort">{Object.entries(params).filter(([key, value]) => key !== 'sort' && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<CourseSort value={params.sort || 'newest'} /></form></div>
    {chips.length > 0 && <div className="discover-active-filters" aria-label="Aktive filtre">{chips.map(chip => <Link key={chip.key} href={query(params, { [chip.key]: undefined })} aria-label={`Fjern filter: ${chip.label}`}>{chip.label}<X size={13} aria-hidden="true" /></Link>)}<Link className="discover-clear" href="/online-courses">Nullstill alle</Link></div>}
    {error && <div className="catalogue-error" role="alert"><h2>Vi kunne ikke hente alle kursene</h2><p>Prøv igjen om litt. Noen kurs eller treneropplysninger kan mangle.</p><Link href={returnPath}>Prøv igjen</Link></div>}
    {visible.length > 0 ? <section aria-label="Nettkurs" className="catalogue-grid">{visible.map(course => <DiscoveryCard key={course.id} id={course.id} kind="online_course" category={levels[course.level] || 'Nettkurs'} title={course.title} href={`/online-courses/${course.slug}`} image={course.cover_image_url} description={course.summary || 'Se kursinnholdet og lær i ditt eget tempo.'} provider={trainers.get(course.trainer_id)?.business_name || 'Hundetrener'} location="På nett · I ditt eget tempo" detail={durationLabel(course.estimated_minutes)} price={course.price_nok} rating={null} reviewCount={0} tags={course.tags || []} availability="Start når du vil" save={!user || canSave ? { saved: saved.has(course.id), canSave, returnPath } : null} />)}</section> : !error && <section className="catalogue-empty"><SearchX size={32} strokeWidth={1.5} aria-hidden="true" /><h2>{courses.length ? 'Ingen kurs matcher søket' : 'Ingen nettkurs publisert ennå'}</h2><p>{courses.length ? 'Prøv et annet emne, eller fjern et filter for å se flere kurs.' : 'Kursene dukker opp her når trenerne publiserer dem. Du kan også utforske privattimer og lokale kurs.'}</p><Link className="btn secondary" href={courses.length ? '/online-courses' : '/discover'}>{courses.length ? 'Se alle nettkurs' : 'Finn annen trening'}</Link></section>}
    {pageCount > 1 && <nav className="catalogue-pagination" aria-label="Resultatsider">{page > 1 ? <Link href={query(params, { page: String(page - 1) })}><ArrowLeft size={16} aria-hidden="true" />Forrige</Link> : <span />}<span>Side {page} av {pageCount}</span>{page < pageCount ? <Link href={query(params, { page: String(page + 1) })}>Neste<ArrowRight size={16} aria-hidden="true" /></Link> : <span />}</nav>}
  </main>;
}
