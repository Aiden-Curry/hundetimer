import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, ChevronDown, Clock3, GraduationCap, LockKeyhole, Play, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { buyOnlineCourseAction } from '../actions';
import { SaveButton } from '@/components/save-button';
import { DiscoveryImage } from '@/components/discovery-controls';
import { InlinePaymentForm } from '@/components/inline-payment-form';
import { previewPromotion } from '@/lib/promotions/server';
import './course-detail.css';

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }
function duration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `${hours} ${hours === 1 ? 'time' : 'timer'}${rest ? ` ${rest} min` : ''}`;
}
const levelText: Record<string, string> = { all: 'Alle nivåer', beginner: 'Nybegynner', intermediate: 'Viderekommen', advanced: 'Avansert' };

export default async function CourseDetail({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; promo?: string }>;
}) {
  const { slug } = await params;
  const { error, promo } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: course } = await supabase.from('online_courses').select('*').eq('slug', slug).maybeSingle();
  if (!course || (!course.published && course.trainer_id !== user?.id)) notFound();
  const [trainerResult, moduleResult, lessonResult, profileResult, dogsResult, purchaseResult] = await Promise.all([
    supabase.from('trainer_profiles').select('business_name,slug,profile_image_url,verified,bio,city').eq('id', course.trainer_id).maybeSingle(),
    supabase.from('online_course_modules').select('id,title,position').eq('course_id', course.id).order('position'),
    supabase.from('online_course_lessons').select('id,module_id,title,duration_minutes,is_preview,position').eq('course_id', course.id).order('position'),
    user ? supabase.from('profiles').select('role').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from('dogs').select('id,name,breed').eq('owner_id', user.id).order('name') : Promise.resolve({ data: [] as { id: string; name: string; breed: string | null }[] }),
    user ? supabase.from('online_course_purchases').select('id,status,payment_status').eq('course_id', course.id).eq('customer_id', user.id).eq('status', 'active').eq('payment_status', 'captured').maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const trainer = trainerResult.data;
  const modules = moduleResult.data || [];
  const lessons = lessonResult.data || [];
  const purchase = purchaseResult.data;
  const canSave = Boolean(user) && profileResult.data?.role !== 'admin';
  const promotion = promo ? await previewPromotion(supabase, 'online_course', course.id, promo) : null;
  const discount = promotion?.discount_nok || 0;
  const discountedSubtotal = promotion?.discounted_subtotal_nok ?? course.price_nok;
  const serviceFee = 29;
  const total = discountedSubtotal + serviceFee;
  const { data: savedRow } = canSave ? await supabase.from('saved_items').select('id').eq('owner_id', user!.id).eq('item_type', 'online_course').eq('item_id', course.id).maybeSingle() : { data: null };
  const returnPath = `/online-courses/${slug}${promo ? `?promo=${encodeURIComponent(promo)}` : ''}`;
  const curriculum = modules.map(module => ({ ...module, lessons: lessons.filter(lesson => lesson.module_id === module.id) }));
  const preview = course.published ? curriculum.flatMap(module => module.lessons).find(lesson => lesson.is_preview) : null;
  const previewHref = preview ? `/online-courses/${slug}/preview/${preview.id}` : null;
  const contentError = moduleResult.error || lessonResult.error;
  const description = course.description || course.summary;

  return <main className="page-shell course-detail-page">
    <div className="cd-topline"><Link href="/online-courses"><ArrowLeft size={16} aria-hidden="true" />Alle nettkurs</Link>{(!user || canSave) && course.published && <div className="cd-save"><span>Lagre kurs</span><SaveButton itemType="online_course" itemId={course.id} saved={Boolean(savedRow)} canSave={canSave} returnPath={returnPath} compact={false} /></div>}</div>
    {!course.published && <div className="notice">Forhåndsvisning: Dette kurset er et utkast og kan ikke kjøpes ennå.</div>}
    <header className="cd-heading"><h1>{course.title}</h1>{course.summary && <p>{course.summary}</p>}<div className="cd-meta"><span><GraduationCap size={17} aria-hidden="true" />{levelText[course.level] || 'Alle nivåer'}</span>{!contentError && <a href="#kursinnhold"><BookOpen size={16} aria-hidden="true" />{lessons.length} {lessons.length === 1 ? 'leksjon' : 'leksjoner'}</a>}{course.estimated_minutes > 0 && <span><Clock3 size={16} aria-hidden="true" />Ca. {duration(course.estimated_minutes)}</span>}{course.certificate_enabled && <span><Award size={17} aria-hidden="true" />Kursbevis</span>}</div>{trainer && <a className="cd-byline" href="#kursholder">Med <strong>{trainer.business_name}</strong>{trainer.verified && <ShieldCheck size={15} aria-label="Verifisert trener" />}</a>}</header>
    <div className="cd-layout">
      <div className="cd-media"><div className="cd-cover">{course.cover_image_url ? <DiscoveryImage key={course.cover_image_url} src={course.cover_image_url} fallback={<div className="cd-cover-fallback"><BookOpen size={42} strokeWidth={1.3} aria-hidden="true" /><span>{course.title}</span><small>Nettkurs · {levelText[course.level] || 'Alle nivåer'}</small></div>} /> : <div className="cd-cover-fallback"><BookOpen size={42} strokeWidth={1.3} aria-hidden="true" /><span>{course.title}</span><small>Nettkurs · {levelText[course.level] || 'Alle nivåer'}</small></div>}</div>{previewHref && !purchase && <div className="cd-preview-bar"><div><strong>Se en leksjon før du bestemmer deg</strong><span>{preview!.title}</span></div><Link href={previewHref}><Play size={15} aria-hidden="true" />Se gratis</Link></div>}</div>

      <aside className="cd-purchase" id="kjop-kurs" aria-label={purchase ? 'Ditt kurs' : 'Kjøp kurs'}>
        {purchase ? <><div className="cd-owned"><Check size={19} aria-hidden="true" />Du har tilgang til dette kurset</div><h2>Fortsett der du slapp</h2><p className="cd-purchase-intro">Leksjonene og fremdriften din ligger klare i kursoversikten.</p><Link className="btn cd-primary" href={`/learn/${purchase.id}`}>Fortsett kurset<ArrowRight size={17} aria-hidden="true" /></Link></> : !course.published ? <><h2>Kurset er et utkast</h2><p className="cd-purchase-intro">Publiser kurset når innholdet er klart.</p><Link className="btn cd-primary" href={`/trainer-dashboard/online-courses/${course.id}`}>Rediger kurset<ArrowRight size={17} aria-hidden="true" /></Link></> : <>
          <h2>Få tilgang til kurset</h2><div className="cd-total-price"><strong>{money(total)}</strong><span>Totalt, inkludert servicegebyr</span></div>
          <dl className="cd-price-breakdown"><div><dt>Kurspris</dt><dd>{money(course.price_nok)}</dd></div>{promotion && <div className="cd-discount"><dt>Rabatt ({promotion.code})</dt><dd>−{money(discount)}</dd></div>}<div><dt>Servicegebyr</dt><dd>{money(serviceFee)}</dd></div></dl>
          <details className="cd-promo" open={Boolean(promo)}><summary>Har du en rabattkode?<ChevronDown size={15} aria-hidden="true" /></summary><form method="get" action={`/online-courses/${slug}`}><label htmlFor="course-promo">Rabattkode</label><div><input id="course-promo" name="promo" defaultValue={promo || ''} placeholder="Skriv inn kode" /><button className="btn secondary compact" type="submit">Bruk</button></div></form>{promo && !promotion && <p className="cd-error" role="alert">Ugyldig eller utløpt kode.</p>}{promotion && <p className="cd-promo-success" role="status">Du sparer {money(discount)}.</p>}{promo && <Link className="cd-remove-promo" href={`/online-courses/${slug}`}>Fjern kode</Link>}</details>
          {!user ? <><Link className="btn cd-primary" href={`/login?next=${encodeURIComponent(returnPath)}`}>Logg inn og kjøp<ArrowRight size={17} aria-hidden="true" /></Link><p className="cd-login-note">Du bekrefter og betaler etter innlogging.</p></> : <InlinePaymentForm action={buyOnlineCourseAction} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''} amountNok={total} className="cd-payment"><input type="hidden" name="courseId" value={course.id} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="promoCode" value={promotion?.code || ''} /><label>Knytt til hund (valgfritt)<select name="dogId" defaultValue=""><option value="">Ingen bestemt hund</option>{(dogsResult.data || []).map(dog => <option value={dog.id} key={dog.id}>{dog.name}{dog.breed ? ` · ${dog.breed}` : ''}</option>)}</select></label></InlinePaymentForm>}
          {error && <p className="cd-error" role="alert">{error}</p>}
        </>}
        <ul className="cd-included"><li><BookOpen size={16} aria-hidden="true" />Tilgang til kursinnholdet</li><li><Clock3 size={16} aria-hidden="true" />Lær i ditt eget tempo</li>{course.certificate_enabled && <li><Award size={16} aria-hidden="true" />Kursbevis ved fullføring</li>}</ul>
      </aside>

      <div className="cd-body"><nav className="cd-navigation" aria-label="På denne kurssiden"><a href="#om-kurset">Om kurset</a><a href="#kursinnhold">Kursinnhold</a>{trainer && <a href="#kursholder">Kursholder</a>}</nav>
        <section className="cd-section" id="om-kurset" aria-labelledby="cd-about-title"><h2 id="cd-about-title">Om kurset</h2><div className="cd-description">{description ? description.split(/\n+/).filter(Boolean).map((paragraph: string, index: number) => <p key={index}>{paragraph}</p>) : <p>Se leksjonene nedenfor for å bli kjent med innholdet.</p>}</div>{course.tags?.length > 0 && <div className="cd-tags">{course.tags.map((tag: string) => <Link href={`/online-courses?topic=${encodeURIComponent(tag)}`} key={tag}>{tag}</Link>)}</div>}</section>
        <section className="cd-section" id="kursinnhold" aria-labelledby="cd-content-title"><div className="cd-section-heading"><h2 id="cd-content-title">Kursinnhold</h2>{!contentError && <span>{modules.length} {modules.length === 1 ? 'modul' : 'moduler'} · {lessons.length} {lessons.length === 1 ? 'leksjon' : 'leksjoner'}</span>}</div>{contentError ? <p className="cd-content-notice" role="status">Vi kunne ikke hente kursinnholdet. Prøv å laste siden på nytt.</p> : lessons.length === 0 ? <p className="cd-content-notice">Kursholderen har ikke lagt til leksjoner ennå.</p> : <div className="cd-modules">{curriculum.map((module, moduleIndex) => <details className="cd-module" key={module.id} open={moduleIndex === 0}><summary><span className="cd-module-number">{String(moduleIndex + 1).padStart(2, '0')}</span><div><h3>{module.title}</h3><span>{module.lessons.length} {module.lessons.length === 1 ? 'leksjon' : 'leksjoner'}</span></div><ChevronDown size={18} aria-hidden="true" /></summary><ol>{module.lessons.map(lesson => <li className="cd-lesson" key={lesson.id}><BookOpen size={17} aria-hidden="true" /><div><strong>{lesson.title}</strong><span>{lesson.duration_minutes > 0 ? `${lesson.duration_minutes} min` : 'I eget tempo'}{lesson.is_preview && course.published && !purchase ? ' · Gratis forhåndsvisning' : ''}</span></div>{purchase ? <Link href={`/learn/${purchase.id}/lesson/${lesson.id}`} aria-label={`Åpne ${lesson.title}`}>Åpne<ArrowRight size={15} aria-hidden="true" /></Link> : lesson.is_preview && course.published ? <Link href={`/online-courses/${slug}/preview/${lesson.id}`} aria-label={`Se gratis: ${lesson.title}`}>Se gratis<Play size={14} aria-hidden="true" /></Link> : <span className="cd-locked" aria-label="Inkludert ved kjøp" title="Inkludert ved kjøp"><LockKeyhole size={16} aria-hidden="true" /></span>}</li>)}</ol>{module.lessons.length === 0 && <p className="cd-module-empty">Ingen leksjoner i denne modulen ennå.</p>}</details>)}</div>}</section>
        {trainer && <section className="cd-section" id="kursholder" aria-labelledby="cd-trainer-title"><h2 id="cd-trainer-title">Kursholder</h2><div className="cd-trainer"><div className="cd-trainer-heading"><div className="cd-trainer-avatar" aria-hidden="true">{trainer.profile_image_url ? <DiscoveryImage key={trainer.profile_image_url} src={trainer.profile_image_url} fallback={<span>{trainer.business_name.slice(0, 1)}</span>} /> : <span>{trainer.business_name.slice(0, 1)}</span>}</div><div><h3><Link href={`/trainers/${trainer.slug}`}>{trainer.business_name}</Link></h3><span>{trainer.city}{trainer.verified && <><ShieldCheck size={14} aria-hidden="true" />Verifisert trener</>}</span></div></div>{trainer.bio && <p>{trainer.bio}</p>}<Link className="cd-trainer-link" href={`/trainers/${trainer.slug}`}>Se trenerprofil<ArrowRight size={16} aria-hidden="true" /></Link></div></section>}
      </div>
    </div>
  </main>;
}
