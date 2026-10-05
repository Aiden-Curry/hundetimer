import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Languages, Mail, MapPin, ShieldCheck, Star, Video } from 'lucide-react';
import { DiscoveryCard } from '@/components/discovery-card';
import { DiscoveryImage } from '@/components/discovery-controls';
import '../../discover/discover.css';
import './profile.css';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { findTrainer } from '@/lib/mock-data';
import { SaveButton } from '@/components/save-button';
import { ReportButton } from '@/components/report-button';
import { subscribeTrainerNewsletterAction, unsubscribeTrainerNewsletterAction } from '@/app/newsletter/actions';

function formatSlot(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}


function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

function stars(rating: number) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }

function externalUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export default async function TrainerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    const trainer = findTrainer(slug);
    if (!trainer) { notFound(); throw new Error('Fant ikke hundetreneren.'); }
    return <main className="page-shell trainer-profile-page"><div className="tp-topline"><Link href="/discover?type=trainers"><ArrowLeft size={16} aria-hidden="true" /> Alle hundetrenere</Link></div><header className="tp-hero"><div className="tp-identity"><div className="tp-avatar" aria-hidden="true">{trainer.name.slice(0, 1)}</div><div className="tp-identity-copy"><div className="tp-location">{trainer.city} · Demoprofil</div><h1>{trainer.name}</h1><p className="muted">{trainer.bio}</p><div className="tp-specialties">{trainer.specialties.map(item => <span key={item}>{item}</span>)}</div></div></div></header></main>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: viewerProfile } = user ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle() : { data: null };
  const canSave = Boolean(user) && viewerProfile?.role !== 'admin';
  const showSave = !user || canSave;
  const { data: trainer } = await supabase
    .from('trainer_profiles')
    .select('id, slug, business_name, bio, city, specialties, languages, verified, profile_image_url, cover_image_url, website_url, instagram_url')
    .eq('slug', slug)
    .maybeSingle();

  if (!trainer) { notFound(); throw new Error('Fant ikke hundetreneren.'); }

  const { data: services } = await supabase
    .from('services')
    .select('id, title, description, duration_minutes, price_nok, booking_mode, delivery_mode')
    .eq('trainer_id', trainer.id)
    .eq('active', true)
    .order('created_at');

  const { data: onlineCourses } = await supabase.from('online_courses').select('id,slug,title,summary,cover_image_url,price_nok,tags,estimated_minutes').eq('trainer_id', trainer.id).eq('published', true).order('published_at', { ascending: false });

  const { data: groupOfferings } = await supabase
    .from('group_offerings')
    .select('id, kind, title, description, city, venue_name, is_online, price_nok, capacity, confirmed_count')
    .eq('trainer_id', trainer.id)
    .eq('active', true)
    .is('completed_at', null)
    .order('created_at', { ascending: false });
  const groupOfferingIds = (groupOfferings || []).map((offering) => offering.id);
  const { data: groupSessions } = groupOfferingIds.length
    ? await supabase.from('group_sessions').select('offering_id, starts_at, ends_at').in('offering_id', groupOfferingIds).gt('starts_at', new Date().toISOString()).order('starts_at')
    : { data: [] as { offering_id: string; starts_at: string; ends_at: string }[] };

  const serviceIds = (services || []).map((service) => service.id);
  const { data: slots, error: slotsError } = serviceIds.length
    ? await supabase.from('availability_slots').select('id, service_id, starts_at, ends_at').in('service_id', serviceIds).eq('status', 'open').gt('starts_at', new Date().toISOString()).order('starts_at').limit(120)
    : { data: [] as { id: string; service_id: string | null; starts_at: string; ends_at: string }[], error: null };

  const slotsByService = new Map<string, typeof slots>();
  for (const service of services || []) slotsByService.set(service.id, (slots || []).filter((slot) => slot.service_id === service.id).slice(0, 6));

  const { data: reviews } = await supabase.from('reviews').select('id, service_id, rating, comment, trainer_reply, trainer_replied_at, created_at').eq('trainer_id', trainer.id).eq('moderation_status', 'visible').order('created_at', { ascending: false }).limit(50);
  const reviewCount = (reviews || []).length;
  const ratingAverage = reviewCount ? (reviews || []).reduce((sum, review) => sum + review.rating, 0) / reviewCount : null;
  const serviceMap = new Map((services || []).map((service) => [service.id, service.title]));
  const [{ data: savedRows }, { data: newsletterSubscription }] = await Promise.all([
    canSave ? supabase.from('saved_items').select('item_type,item_id').eq('owner_id', user!.id) : Promise.resolve({ data: [] as {item_type:string;item_id:string}[] }),
    canSave ? supabase.from('newsletter_subscriptions').select('id,unsubscribed_at').eq('scope','trainer').eq('trainer_id',trainer.id).eq('user_id',user!.id).maybeSingle() : Promise.resolve({data:null}),
  ]);
  const savedSet = new Set((savedRows || []).map((item:any) => `${item.item_type}:${item.item_id}`));
  const returnPath = `/trainers/${slug}`;
  const newsletterActive = Boolean(newsletterSubscription && !newsletterSubscription.unsubscribed_at);

  const upcomingActivities = (groupOfferings || []).flatMap(offering => {
    const sessions = (groupSessions || []).filter(session => session.offering_id === offering.id);
    return sessions.length ? [{ offering, sessions, firstSession: sessions[0] }] : [];
  }).sort((a, b) => a.firstSession.starts_at.localeCompare(b.firstSession.starts_at));
  const fromPrice = services?.length ? Math.min(...services.map(service => service.price_nok)) : null;
  const nextSlot = slots?.[0];
  const nextService = services?.find(service => service.id === nextSlot?.service_id);
  const primaryAnchor = services?.length ? '#privattimer' : upcomingActivities.length ? '#aktiviteter' : onlineCourses?.length ? '#nettkurs' : '#om-treneren';
  const primaryLabel = services?.length ? 'Velg privattime' : upcomingActivities.length ? 'Se kurs og aktiviteter' : onlineCourses?.length ? 'Se nettkurs' : 'Om treneren';
  const website = externalUrl(trainer.website_url);
  const instagram = externalUrl(trainer.instagram_url);
  const saveState = (kind: string, id: string) => showSave ? { saved: savedSet.has(`${kind}:${id}`), canSave, returnPath } : null;
  const reviewCard = (review: NonNullable<typeof reviews>[number]) => <article className="tp-review" key={review.id}>
    <div className="tp-review-heading"><div><div className="tp-stars" aria-label={`${review.rating} av 5 stjerner`}>{stars(review.rating)}</div><strong>Verifisert kunde</strong></div><time dateTime={review.created_at}>{formatReviewDate(review.created_at)}</time></div>
    {serviceMap.get(review.service_id) && <span className="tp-review-service">{serviceMap.get(review.service_id)}</span>}
    <p>{review.comment || 'Kunden la igjen en stjernevurdering uten kommentar.'}</p>
    {review.trainer_reply && <div className="tp-review-reply"><strong>Svar fra {trainer.business_name}</strong><p>{review.trainer_reply}</p></div>}
    {user && <ReportButton targetType="review" targetId={review.id} />}
  </article>;

  return (
    <main className="page-shell trainer-profile-page">
      <div className="tp-topline"><Link href="/discover?type=trainers"><ArrowLeft size={16} aria-hidden="true" /> Alle hundetrenere</Link><div className="tp-profile-actions">{showSave && trainer.verified && <><span>Lagre trener</span><SaveButton itemType="trainer" itemId={trainer.id} saved={savedSet.has(`trainer:${trainer.id}`)} canSave={canSave} returnPath={returnPath} compact={false} /></>}</div></div>
      {!trainer.verified && user && <div className="notice">Forhåndsvisning: Denne trenerprofilen er ikke offentlig før verifiseringen er godkjent.</div>}
      <header className="tp-hero">
        {trainer.cover_image_url && <div className="tp-cover"><DiscoveryImage key={trainer.cover_image_url} src={trainer.cover_image_url} fallback={null} /></div>}
        <div className="tp-identity">
          <div className="tp-avatar" aria-hidden="true">{trainer.profile_image_url ? <DiscoveryImage key={trainer.profile_image_url} src={trainer.profile_image_url} fallback={<span>{trainer.business_name.slice(0, 1)}</span>} /> : <span>{trainer.business_name.slice(0, 1)}</span>}</div>
          <div className="tp-identity-copy"><div className="tp-location"><MapPin size={16} aria-hidden="true" />{trainer.city}{trainer.verified && <span className="tp-verified"><ShieldCheck size={15} aria-hidden="true" /> Verifisert trener</span>}</div><h1>{trainer.business_name}</h1><div className="tp-meta">{reviewCount ? <a href="#vurderinger"><Star size={15} aria-hidden="true" /><strong>{ratingAverage?.toFixed(1).replace('.', ',')}</strong><span>{reviewCount === 50 ? 'Siste 50 vurderinger' : `${reviewCount} ${reviewCount === 1 ? 'vurdering' : 'vurderinger'}`}</span></a> : <span>Ingen vurderinger ennå</span>}{trainer.languages?.length > 0 && <span><Languages size={15} aria-hidden="true" />{trainer.languages.join(', ')}</span>}</div><div className="tp-specialties">{(trainer.specialties || []).map((specialty: string) => <span key={specialty}>{specialty}</span>)}</div></div>
          <a className="btn tp-hero-cta" href={primaryAnchor}>{primaryLabel}<ArrowRight size={17} aria-hidden="true" /></a>
        </div>
      </header>
      <nav className="tp-navigation" aria-label="På denne trenerprofilen">{services?.length ? <a href="#privattimer">Privattimer <span>{services.length}</span></a> : null}{upcomingActivities.length > 0 && <a href="#aktiviteter">Kurs og aktiviteter <span>{upcomingActivities.length}</span></a>}{onlineCourses?.length ? <a href="#nettkurs">Nettkurs <span>{onlineCourses.length}</span></a> : null}<a href="#om-treneren">Om treneren</a><a href="#vurderinger">Vurderinger{reviewCount > 0 && <span>{reviewCount}</span>}</a></nav>

      <div className="tp-layout">
        <div className="tp-main">
          {services?.length ? <section className="tp-section" id="privattimer" aria-labelledby="tp-services-title"><div className="tp-section-heading"><h2 id="tp-services-title">Privattimer</h2><p>Velg en tjeneste og et tidspunkt som passer deg. Alle tider er norsk tid.</p></div>
            {slotsError && <div className="notice" role="status">Vi kunne ikke hente ledige tider akkurat nå. Åpne tjenesten for å prøve igjen.</div>}
            <div className="tp-services">{services.map(service => {
              const available = slotsByService.get(service.id) || [];
              return <article className="tp-service" key={service.id}><div className="tp-service-heading"><h3>{service.title}</h3>{showSave && <SaveButton itemType="service" itemId={service.id} saved={savedSet.has(`service:${service.id}`)} canSave={canSave} returnPath={returnPath} />}</div>
                <div className="tp-service-meta"><span><Clock3 size={15} aria-hidden="true" />{service.duration_minutes} min</span><span>{service.delivery_mode === 'online' ? <Video size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}{service.delivery_mode === 'online' ? 'På nett' : service.delivery_mode === 'both' ? 'Fysisk eller på nett' : 'Fysisk oppmøte'}</span><span className="tp-booking-mode">{service.booking_mode === 'instant' ? 'Direktebestilling' : 'Treneren bekrefter'}</span></div>
                {service.description && <p className="tp-service-description">{service.description}</p>}
                <div className="tp-service-price"><strong>{money(service.price_nok)}</strong><span>per økt</span></div>
                <div className="tp-service-booking"><div className="tp-slot-heading"><span>{available.length ? 'Neste ledige tider' : slotsError ? 'Tilgjengelighet' : 'Ingen ledige tider akkurat nå'}</span><Link href={`/book/${service.id}`}>{available.length ? 'Se alle tider' : 'Se tjenesten'}<ArrowRight size={14} aria-hidden="true" /></Link></div>{available.length > 0 && <div className="tp-slots">{available.slice(0, 3).map(slot => <Link key={slot.id} href={`/book/${service.id}?slot=${slot.id}`} aria-label={`Bestill ${service.title}, ${formatSlot(slot.starts_at)}`}><CalendarDays size={15} aria-hidden="true" />{formatSlot(slot.starts_at)}</Link>)}</div>}</div>
              </article>;
            })}</div>
          </section> : null}

          {upcomingActivities.length > 0 && <section className="tp-section" id="aktiviteter" aria-labelledby="tp-activities-title"><div className="tp-section-heading"><h2 id="tp-activities-title">Kurs og aktiviteter</h2><p>Kommende samlinger med {trainer.business_name}.</p></div><div className="discover-card-grid">{upcomingActivities.map(({ offering, sessions, firstSession }) => {
            const remaining = Math.max(0, offering.capacity - offering.confirmed_count);
            return <DiscoveryCard key={offering.id} id={offering.id} kind="activity" category={offering.kind === 'course' ? 'Kurs' : 'Arrangement'} title={offering.title} href={`/activities/${offering.id}`} description={offering.description || ''} location={offering.is_online ? 'På nett' : [offering.venue_name, offering.city].filter(Boolean).join(' · ')} detail={`${formatSlot(firstSession.starts_at)}${sessions.length > 1 ? ` · ${sessions.length} samlinger` : ''}`} price={offering.price_nok} rating={null} reviewCount={0} tags={[]} availability={remaining === 0 ? 'Fullbooket' : `${remaining} ${remaining === 1 ? 'ledig plass' : 'ledige plasser'}`} full={remaining === 0} save={saveState('activity', offering.id)} />;
          })}</div></section>}

          {onlineCourses?.length ? <section className="tp-section" id="nettkurs" aria-labelledby="tp-online-title"><div className="tp-section-heading"><h2 id="tp-online-title">Nettkurs</h2><p>Lær hjemme, når det passer deg.</p></div><div className="discover-card-grid">{onlineCourses.map(course => <DiscoveryCard key={course.id} id={course.id} kind="online_course" category="Nettkurs" title={course.title} href={`/online-courses/${course.slug}`} image={course.cover_image_url} description={course.summary || 'Lær i ditt eget tempo.'} location="På nett" detail={course.estimated_minutes ? `Ca. ${course.estimated_minutes} min` : 'I ditt eget tempo'} price={course.price_nok} rating={null} reviewCount={0} tags={course.tags || []} availability="Start når du vil" save={saveState('online_course', course.id)} />)}</div></section> : null}

          {!services?.length && upcomingActivities.length === 0 && !onlineCourses?.length && <div className="tp-empty"><CalendarDays size={24} aria-hidden="true" /><h2>Ingen trening publisert ennå</h2><p>Se andre trenere, eller kom tilbake senere.</p><Link className="btn secondary" href="/discover?type=trainers">Finn andre hundetrenere</Link></div>}

          <section className="tp-section" id="om-treneren" aria-labelledby="tp-about-title"><div className="tp-section-heading"><h2 id="tp-about-title">Om {trainer.business_name}</h2></div><div className="tp-about"><p>{trainer.bio || 'Treneren har ikke lagt til en beskrivelse ennå.'}</p><dl><div><dt><MapPin size={16} aria-hidden="true" />Sted</dt><dd>{trainer.city}</dd></div>{trainer.languages?.length > 0 && <div><dt><Languages size={16} aria-hidden="true" />Språk</dt><dd>{trainer.languages.join(', ')}</dd></div>}</dl>{(website || instagram) && <div className="tp-external-links">{website && <a href={website} target="_blank" rel="noreferrer">Nettside ↗</a>}{instagram && <a href={instagram} target="_blank" rel="noreferrer">Instagram ↗</a>}</div>}</div></section>

          <section className="tp-section" id="vurderinger" aria-labelledby="tp-reviews-title"><div className="tp-section-heading"><h2 id="tp-reviews-title">Vurderinger</h2><p>Bare kunder med en fullført bestilling kan legge igjen en vurdering.</p></div>{reviewCount > 0 ? <><div className="tp-review-summary"><Star size={23} aria-hidden="true" /><strong>{ratingAverage?.toFixed(1).replace('.', ',')}</strong><span>av 5 · {reviewCount === 50 ? 'basert på de siste 50 vurderingene' : `${reviewCount} ${reviewCount === 1 ? 'verifisert vurdering' : 'verifiserte vurderinger'}`}</span></div><div className="tp-reviews">{reviews!.slice(0, 3).map(reviewCard)}</div>{reviewCount > 3 && <details className="tp-more-reviews"><summary>Vis flere vurderinger ({reviewCount - 3})</summary><div className="tp-reviews">{reviews!.slice(3).map(reviewCard)}</div></details>}</> : <p className="tp-quiet-empty">Denne treneren har ingen vurderinger ennå.</p>}</section>
          {user && user.id !== trainer.id && <div className="tp-report"><ReportButton targetType="trainer" targetId={trainer.id} compact={false} /></div>}
        </div>

        <aside className="tp-sidebar" aria-label="Bestilling og oppdateringer">
          <div className="tp-booking-summary"><h2>Tren med {trainer.business_name}</h2>{fromPrice != null && <div className="tp-summary-price"><span>Privattimer fra</span><strong>{money(fromPrice)}</strong></div>}{nextSlot && nextService ? <div className="tp-next-time"><CalendarDays size={18} aria-hidden="true" /><div><span>Neste ledige privattime</span><strong>{formatSlot(nextSlot.starts_at)}</strong><small>{nextService.title} · {money(nextService.price_nok)}</small></div></div> : <p className="tp-summary-description">{services?.length ? 'Se tjenester og tilgjengelighet nedenfor.' : 'Utforsk trenerens tilbud og finn det som passer dere.'}</p>}<a className="btn" href={primaryAnchor}>{primaryLabel}<ArrowRight size={16} aria-hidden="true" /></a>{nextSlot && nextService && <Link className="tp-next-booking" href={`/book/${nextService.id}?slot=${nextSlot.id}`}>Velg neste ledige time</Link>}<p className="tp-booking-note">Du ser alle detaljer før du bekrefter bestillingen.</p></div>
          {trainer.verified && (canSave || !user) && <div className="tp-newsletter"><Mail size={20} aria-hidden="true" /><h2>{newsletterActive ? 'Du mottar nyheter' : 'Nye kurs på e-post'}</h2><p>{newsletterActive ? `Du abonnerer på nyheter fra ${trainer.business_name}.` : `Få oppdateringer når ${trainer.business_name} har noe nytt.`}</p><form action={newsletterActive ? unsubscribeTrainerNewsletterAction : subscribeTrainerNewsletterAction}><input type="hidden" name="trainerId" value={trainer.id} /><input type="hidden" name="returnPath" value={returnPath} /><button className="btn secondary" type="submit">{newsletterActive ? 'Meld meg av' : 'Motta nyhetsbrev'}</button></form><small>Frivillig markedsføring på e-post. Du kan melde deg av når som helst.</small></div>}
        </aside>
      </div>
    </main>
  );
}
