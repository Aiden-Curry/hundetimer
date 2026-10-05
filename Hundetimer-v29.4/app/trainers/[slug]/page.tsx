import Link from 'next/link';
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

export default async function TrainerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    const trainer = findTrainer(slug);
    if (!trainer) { notFound(); throw new Error('Fant ikke hundetreneren.'); }
    return <main className="page-shell narrow"><Link className="back-link" href="/discover?type=trainers">← Tilbake til hundetrenere</Link><section className="profile-hero"><div className="avatar large" aria-hidden="true">{trainer.name.slice(0, 1)}</div><div><div className="eyebrow">{trainer.city} · DEMODATA</div><h1>{trainer.name} {trainer.verified ? <span className="verified">✓</span> : null}</h1><p className="muted lead">{trainer.bio}</p><div className="chips">{trainer.specialties.map((item) => <span className="chip" key={item}>{item}</span>)}</div></div></section></main>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: viewerProfile } = user ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle() : { data: null };
  const canSave = viewerProfile?.role === 'owner';
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
  const { data: slots } = serviceIds.length
    ? await supabase.from('availability_slots').select('id, service_id, starts_at, ends_at').in('service_id', serviceIds).eq('status', 'open').gt('starts_at', new Date().toISOString()).order('starts_at').limit(120)
    : { data: [] as { id: string; service_id: string | null; starts_at: string; ends_at: string }[] };

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

  return (
    <main className="page-shell narrow">
      <Link className="back-link" href="/discover?type=trainers">← Tilbake til hundetrenere</Link>
      {!trainer.verified && user ? <div className="notice">Forhåndsvisning: Denne trenerprofilen er ikke offentlig før verifiseringen er godkjent.</div> : null}
      <div className="detail-actions-row">{showSave && trainer.verified ? <SaveButton itemType="trainer" itemId={trainer.id} saved={savedSet.has(`trainer:${trainer.id}`)} canSave={canSave} returnPath={returnPath} compact={false} /> : null}{user && user.id !== trainer.id ? <ReportButton targetType="trainer" targetId={trainer.id} compact={false} /> : null}</div>
      <section className="public-trainer-hero">
        <div className="trainer-cover" style={trainer.cover_image_url ? { backgroundImage: `url(${trainer.cover_image_url})` } : undefined} />
        <div className="public-trainer-profile-row">
          <div className="avatar large public-trainer-avatar">{trainer.profile_image_url ? <img src={trainer.profile_image_url} alt={`${trainer.business_name} profilbilde`} /> : trainer.business_name.slice(0, 1)}</div>
          <div className="public-trainer-copy">
            <div className="eyebrow">{trainer.city}</div>
            <h1>{trainer.business_name} {trainer.verified ? <span className="verified">✓</span> : null}</h1>
            {reviewCount ? <div className="public-rating-summary"><span className="stars-inline">★</span><strong>{ratingAverage?.toFixed(1)}</strong><span>{reviewCount} verifiserte vurderinger</span></div> : <div className="public-rating-summary muted">Ingen vurderinger ennå</div>}
            {trainer.bio ? <p className="muted lead">{trainer.bio}</p> : null}
            <div className="chips">{(trainer.specialties || []).map((item: string) => <span className="chip" key={item}>{item}</span>)}</div>
            {(trainer.languages?.length || trainer.website_url || trainer.instagram_url) ? <div className="trainer-profile-links">{trainer.languages?.length ? <span>Språk: {trainer.languages.join(', ')}</span> : null}{trainer.website_url ? <a href={trainer.website_url} target="_blank" rel="noreferrer">Nettside ↗</a> : null}{trainer.instagram_url ? <a href={trainer.instagram_url} target="_blank" rel="noreferrer">Instagram ↗</a> : null}</div> : null}
          </div>
        </div>
      </section>

      {trainer.verified && (canSave || !user) ? <section className="content-section trainer-newsletter-card"><div className="section-title"><div><span className="eyebrow">Nyheter fra treneren</span><h2>Få kurs og nyheter fra {trainer.business_name}</h2><p className="muted">Frivillig markedsføring på e-post. Du kan melde deg av når som helst.</p></div>{newsletterActive ? <form action={unsubscribeTrainerNewsletterAction}><input type="hidden" name="trainerId" value={trainer.id}/><input type="hidden" name="returnPath" value={returnPath}/><button className="btn secondary" type="submit">Meld meg av</button></form> : <form action={subscribeTrainerNewsletterAction}><input type="hidden" name="trainerId" value={trainer.id}/><input type="hidden" name="returnPath" value={returnPath}/><button className="btn" type="submit">Motta nyhetsbrev</button></form>}</div></section> : null}

      <section className="content-section reviews-section">
        <div className="section-title"><div><span className="eyebrow">Vurderinger</span><h2>{reviewCount ? `${reviewCount} verifiserte vurderinger` : 'Ingen vurderinger ennå'}</h2></div>{ratingAverage ? <div className="review-average"><span className="stars-inline">★</span><strong>{ratingAverage.toFixed(1)}</strong><span>av 5</span></div> : null}</div>
        {reviewCount ? <div className="review-list">{reviews!.map((review) => <article className="review-card" key={review.id}><div className="review-card-head"><div><div className="review-stars" aria-label={`${review.rating} av 5 stjerner`}>{stars(review.rating)}</div><strong>Verifisert kunde</strong></div><div className="review-meta"><span>Verifisert bestilling</span><span>{formatReviewDate(review.created_at)}</span></div></div>{serviceMap.get(review.service_id) ? <span className="review-service">{serviceMap.get(review.service_id)}</span> : null}{review.comment ? <p>{review.comment}</p> : <p className="muted">Kunden la igjen en stjernevurdering uten kommentar.</p>}{review.trainer_reply ? <div className="trainer-review-reply"><strong>Svar fra {trainer.business_name}</strong><p>{review.trainer_reply}</p></div> : null}{user ? <ReportButton targetType="review" targetId={review.id} /> : null}</article>)}</div> : <div className="empty-state compact-empty"><h3>Ingen har vurdert denne treneren ennå</h3><p className="muted">Bare kunder med en fullført bestilling kan legge igjen en vurdering.</p></div>}
      </section>

      {(onlineCourses || []).length ? <section className="content-section">
        <div className="section-title"><div><span className="eyebrow">Nettkurs</span><h2>Lær med {trainer.business_name} hjemmefra</h2></div><Link className="text-link small" href="/online-courses">Se alle nettkurs →</Link></div>
        <div className="online-course-grid trainer-online-course-grid">{onlineCourses!.map(course => <div className="online-course-card-wrap" key={course.id}>{showSave ? <SaveButton itemType="online_course" itemId={course.id} saved={savedSet.has(`online_course:${course.id}`)} canSave={canSave} returnPath={returnPath} /> : null}<Link href={`/online-courses/${course.slug}`} className="online-course-card">{course.cover_image_url ? <img src={course.cover_image_url} alt="" /> : <div className="course-cover-placeholder">▶</div>}<div className="online-course-card-body"><span className="eyebrow">Nettkurs</span><h3>{course.title}</h3><p className="muted">{course.summary || 'Lær i ditt eget tempo.'}</p><div className="online-course-card-footer"><span>{course.estimated_minutes ? `ca. ${course.estimated_minutes} min` : 'Eget tempo'}</span><strong>{course.price_nok} kr</strong></div></div></Link></div>)}</div>
      </section> : null}

      {(groupOfferings || []).some((offering) => (groupSessions || []).some((session) => session.offering_id === offering.id)) ? <section className="content-section">
        <div className="section-title"><div><span className="eyebrow">Kurs og arrangementer</span><h2>Kommende gruppeaktiviteter</h2></div><Link className="text-link small" href="/discover?type=activities">Se alle aktiviteter →</Link></div>
        <div className="trainer-activity-grid">{(groupOfferings || []).map((offering) => { const firstSession=(groupSessions || []).find((session) => session.offering_id === offering.id); if(!firstSession) return null; const remaining=Math.max(0, offering.capacity-offering.confirmed_count); return <div className="activity-card-wrap" key={offering.id}>{showSave ? <SaveButton itemType="activity" itemId={offering.id} saved={savedSet.has(`activity:${offering.id}`)} canSave={canSave} returnPath={returnPath} /> : null}<Link href={`/activities/${offering.id}`} className="trainer-activity-card"><div className="activity-card-top"><span className={`activity-kind ${offering.kind}`}>{offering.kind === 'course' ? 'Kurs' : 'Arrangement'}</span><span className="muted small">{remaining} ledige</span></div><h3>{offering.title}</h3><p className="muted">{formatSlot(firstSession.starts_at)} · {offering.is_online ? 'På nett' : [offering.venue_name, offering.city].filter(Boolean).join(' · ')}</p><strong>{offering.price_nok} kr</strong></Link></div>; })}</div>
      </section> : null}

      <section className="content-section">
        <div className="section-title"><div><span className="eyebrow">Bestill trening</span><h2>Tjenester og ledige tider</h2></div></div>
        <div className="service-list">
          {(services || []).length ? services!.map((service) => {
            const serviceSlots = slotsByService.get(service.id) || [];
            return <article className="service-card" key={service.id}>{showSave ? <SaveButton itemType="service" itemId={service.id} saved={savedSet.has(`service:${service.id}`)} canSave={canSave} returnPath={returnPath} /> : null}<div className="service-copy"><div className="row start"><div><h3>{service.title}</h3>{service.description ? <p className="muted">{service.description}</p> : null}</div><div className="price-block"><strong>{service.price_nok} kr</strong><span>{service.duration_minutes} min</span></div></div><div className="service-public-badges"><span className={`booking-badge ${service.booking_mode}`}>{service.booking_mode === 'instant' ? 'Direktebestilling' : 'Treneren bekrefter'}</span><span className="booking-badge delivery">{service.delivery_mode === 'online' ? 'På nett' : service.delivery_mode === 'both' ? 'Fysisk + på nett' : 'Fysisk'}</span></div></div><div className="slot-list"><strong>Neste ledige tider</strong>{serviceSlots.length ? <><div className="slots">{serviceSlots.map((slot) => <Link key={slot.id} href={`/book/${service.id}?slot=${slot.id}`} className="slot open">{formatSlot(slot.starts_at)}</Link>)}</div><Link className="text-link small" href={`/book/${service.id}`}>Se alle ledige tider →</Link></> : <p className="muted small">Ingen ledige tider er publisert akkurat nå.</p>}</div></article>;
          }) : <div className="empty-state"><h2>Ingen aktive tjenester ennå</h2><p className="muted">Denne hundetreneren har ikke publisert tjenester ennå.</p></div>}
        </div>
      </section>
    </main>
  );
}
