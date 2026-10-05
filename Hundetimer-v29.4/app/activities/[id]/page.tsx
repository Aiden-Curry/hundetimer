import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatOsloDateTime } from '@/lib/oslo-time';
import { bookGroupActivityAction, joinGroupWaitlistAction, withdrawGroupWaitlistAction } from '../actions';
import { SaveButton } from '@/components/save-button';
import { previewPromotion } from '@/lib/promotions/server';

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string; promo?: string }> }) {
  const { id } = await params; const { error, message, promo } = await searchParams;
  const supabase = await createClient();
  const { data: offering } = await supabase.from('group_offerings').select('*').eq('id', id).maybeSingle();
  if (!offering) { notFound(); throw new Error('Fant ikke aktiviteten.'); }
  const [{ data: sessions }, { data: trainer }, auth, availableResult] = await Promise.all([
    supabase.from('group_sessions').select('*').eq('offering_id', id).order('starts_at'),
    supabase.from('trainer_profiles').select('business_name, slug, profile_image_url, verified').eq('id', offering.trainer_id).maybeSingle(),
    supabase.auth.getUser(),
    supabase.rpc('group_available_places', { p_offering_id:id }),
  ]);
  const user = auth.data.user;
  const { data: viewerProfile } = user ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle() : { data: null };
  const isOwner = viewerProfile?.role === 'owner';
  const canSave = isOwner;
  const showSave = !user || canSave;
  const { data: savedRow } = canSave ? await supabase.from('saved_items').select('id').eq('owner_id', user!.id).eq('item_type','activity').eq('item_id', id).maybeSingle() : { data: null };
  const { data: dogs } = user && isOwner ? await supabase.from('dogs').select('id, name, breed').eq('owner_id', user.id).order('name') : { data: [] as { id:string;name:string;breed:string|null }[] };
  const { data: waitlistRows } = user && isOwner ? await supabase.from('group_waitlist').select('*').eq('offering_id', id).eq('customer_id', user.id).in('status',['waiting','offered','checkout']).order('joined_at').limit(1) : { data: [] as any[] };
  const waitEntry = waitlistRows?.[0] || null;
  const { data: queuePosition } = waitEntry?.status === 'waiting' ? await supabase.rpc('group_waitlist_position', { p_waitlist_id:waitEntry.id }) : { data:null };
  const available = Math.max(0, Number(availableResult.data ?? Math.max(0, offering.capacity - offering.confirmed_count)));
  const firstStart = sessions?.[0]?.starts_at;
  const started = firstStart ? new Date(firstStart) <= new Date() : true;
  const hasPriorityOffer = waitEntry?.status === 'offered' && waitEntry.offer_expires_at && new Date(waitEntry.offer_expires_at) > new Date();
  const canBook = offering.active && !offering.completed_at && !started && (available > 0 || hasPriorityOffer);
  const full = !started && available <= 0 && !hasPriorityOffer;
  const offeredDogId = hasPriorityOffer ? waitEntry.dog_id : null;
  const promotion = promo ? await previewPromotion(supabase, 'group', offering.id, promo) : null;
  const discount = promotion?.discount_nok || 0;
  const discountedSubtotal = promotion?.discounted_subtotal_nok ?? offering.price_nok;
  const total = discountedSubtotal + 29;

  return <main className="page-shell narrow">
    <Link className="back-link" href="/discover?type=activities">← Tilbake til kurs og arrangementer</Link>
    {showSave ? <div className="detail-save-row"><SaveButton itemType="activity" itemId={id} saved={Boolean(savedRow)} canSave={canSave} returnPath={`/activities/${id}`} compact={false} /></div> : null}
    <section className="activity-detail-hero"><div><span className={`activity-kind ${offering.kind}`}>{offering.kind === 'course' ? 'Kurs' : 'Arrangement'}</span><h1>{offering.title}</h1><p className="muted lead">{offering.description || 'Mer informasjon kommer.'}</p>{(offering.tags || []).length ? <div className="chips activity-detail-tags">{(offering.tags || []).map((tag: string) => <span className="chip" key={tag}>{tag}</span>)}</div> : null}<div className="activity-detail-meta"><span>📍 {offering.is_online ? 'På nett' : [offering.venue_name, offering.city].filter(Boolean).join(', ')}</span>{offering.address && !offering.is_online ? <span>🏠 {offering.address}</span> : null}<span>🐕 {available > 0 ? `${available} plasser kan bestilles nå` : 'Fullbooket akkurat nå'}</span></div></div><div className="activity-price-box"><span>Pris per hund</span><strong>{promotion ? money(discountedSubtotal) : money(offering.price_nok)}</strong>{promotion?<small><s>{money(offering.price_nok)}</s> · {promotion.code} sparer {money(discount)}</small>:<small>+ 29 kr servicegebyr</small>}</div></section>

    <div className="activity-detail-layout">
      <div className="activity-detail-main">
        <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Datoer</span><h2>{(sessions || []).length > 1 ? `${sessions!.length} samlinger` : 'Tidspunkt'}</h2></div></div><div className="activity-timeline">{(sessions || []).map((session, index) => <div className="activity-timeline-row" key={session.id}><span className="timeline-number">{index + 1}</span><div><strong>{session.title || (sessions!.length > 1 ? `Samling ${index + 1}` : offering.title)}</strong><span>{formatOsloDateTime(session.starts_at)}</span></div></div>)}</div></section>
        {trainer ? <section className="dashboard-section activity-organizer"><div className="activity-trainer-mini large">{trainer.profile_image_url ? <img src={trainer.profile_image_url} alt="" /> : <span>{trainer.business_name.slice(0,1)}</span>}<div><span className="eyebrow">Arrangør</span><h3>{trainer.business_name} {trainer.verified ? '✓' : ''}</h3><Link className="text-link small" href={`/trainers/${trainer.slug}`}>Se trenerprofil →</Link></div></div></section> : null}
      </div>

      <aside className="activity-book-card">
        {message ? <p className="form-success form-error-block">{message}</p> : null}
        {error ? <p className="form-error form-error-block">{error}</p> : null}
        {hasPriorityOffer ? <div className="waitlist-offer-box"><span className="eyebrow">Din tur</span><h2>En plass er klar 🎉</h2><p>Plassen er reservert for <strong>{waitEntry.dog_name}</strong> til {formatOsloDateTime(waitEntry.offer_expires_at)}.</p></div> : <h2>{full ? 'Venteliste' : 'Meld på hunden din'}</h2>}

        {started || !offering.active || offering.completed_at ? <div className="notice">Påmeldingen er stengt.</div>
        : !user ? <><p className="muted">{full ? 'Logg inn for å bli med på ventelisten.' : 'Logg inn for å velge hund og betale.'}</p><Link className="btn wide" href={`/login?next=${encodeURIComponent(`/activities/${id}${promo ? `?promo=${encodeURIComponent(promo)}` : ''}`)}`}>Logg inn</Link></>
        : !isOwner ? <div className="notice">Bare hundeeierkontoer kan melde på hund eller bruke ventelisten.</div>
        : !(dogs || []).length ? <><p className="muted">Du må lagre hunden din først.</p><Link className="btn wide" href={`/account/dogs?next=${encodeURIComponent(`/activities/${id}${promo ? `?promo=${encodeURIComponent(promo)}` : ''}`)}`}>Legg til hund</Link></>
        : canBook ? <><form id="activity-promo-form" method="get" className="promo-apply-form compact-promo"><label>Rabattkode<input name="promo" defaultValue={promo || ''} placeholder="Skriv inn kode" /></label><button className="btn secondary compact" type="submit">Bruk kode</button>{promo && !promotion ? <small className="form-error">Ugyldig eller utløpt rabattkode.</small> : null}{promotion ? <small className="form-success">Du sparer {money(discount)}.</small> : null}</form><form action={bookGroupActivityAction} className="activity-book-form"><input type="hidden" name="offeringId" value={id} /><input type="hidden" name="promoCode" value={promotion?.code || ''}/><label>Hund<select name="dogId" required defaultValue={offeredDogId || ''} disabled={Boolean(offeredDogId)}>{!offeredDogId ? <option value="" disabled>Velg hund</option> : null}{dogs!.filter((dog) => !offeredDogId || dog.id === offeredDogId).map((dog) => <option value={dog.id} key={dog.id}>{dog.name}{dog.breed ? ` · ${dog.breed}` : ''}</option>)}</select>{offeredDogId ? <input type="hidden" name="dogId" value={offeredDogId} /> : null}</label><label>Melding til treneren<textarea name="note" rows={4} defaultValue={hasPriorityOffer ? waitEntry.customer_note || '' : ''} placeholder="Allergier, behov eller annet treneren bør vite (valgfritt)" /></label><div className="summary-line"><span>Kurs/arrangement</span><strong>{money(offering.price_nok)}</strong></div>{promotion?<div className="summary-line discount-line"><span>Rabatt · {promotion.code}</span><strong>-{money(discount)}</strong></div>:null}<div className="summary-line"><span>Servicegebyr</span><strong>29 kr</strong></div><div className="summary-total"><span>Totalt</span><strong>{money(total)}</strong></div><button className="btn wide" type="submit">{hasPriorityOffer ? 'Bestill den reserverte plassen' : 'Gå til sikker betaling'}</button><p className="muted tiny center">Plassen reserveres i 30 minutter mens du betaler.</p></form></>
        : waitEntry?.status === 'waiting' ? <div className="waitlist-status-box"><span className="eyebrow">På ventelisten</span><h3>{queuePosition ? `Du er nummer ${queuePosition} i køen` : 'Du står i kø'}</h3><p className="muted">Vi sender både varsel og e-post når det blir din tur. Da får du opptil 24 timer til å bestille.</p><form action={withdrawGroupWaitlistAction}><input type="hidden" name="offeringId" value={id} /><input type="hidden" name="waitlistId" value={waitEntry.id} /><button className="btn secondary wide" type="submit">Forlat ventelisten</button></form></div>
        : waitEntry?.status === 'checkout' ? <div className="notice">Du har en betaling pågående for den reserverte plassen.</div>
        : <form action={joinGroupWaitlistAction} className="activity-book-form"><input type="hidden" name="offeringId" value={id} /><p className="muted">Aktiviteten er full. Bli med gratis på ventelisten. Når det blir din tur, holder vi neste ledige plass for deg i opptil 24 timer.</p><label>Hund<select name="dogId" required defaultValue=""><option value="" disabled>Velg hund</option>{dogs!.map((dog) => <option value={dog.id} key={dog.id}>{dog.name}{dog.breed ? ` · ${dog.breed}` : ''}</option>)}</select></label><label>Melding til treneren<textarea name="note" rows={3} placeholder="Valgfritt" /></label><button className="btn wide" type="submit">Bli med på ventelisten</button></form>}
      </aside>
    </div>
  </main>;
}
