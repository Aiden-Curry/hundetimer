import { CustomerNavigation } from '@/components/customer-navigation';
import '@/components/customer-pages.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStripeConfigured } from '@/lib/stripe/server';
import { syncGroupCheckoutSession } from '@/lib/stripe/group-sync';
import { formatOsloDateTime } from '@/lib/oslo-time';
import { cancelGroupEnrollmentAction } from './actions';

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }

export default async function ActivityBookingPage({ params, searchParams }: { params: Promise<{ id:string }>; searchParams: Promise<{ message?:string; error?:string; checkout?:string; session_id?:string }> }) {
  const { id } = await params; const { message, error, checkout, session_id: sessionId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/activity-booking/${id}`)}`);
  if (checkout === 'success' && sessionId && isStripeConfigured()) {
    try { await syncGroupCheckoutSession(sessionId); } catch { /* webhook can retry */ }
  }
  const { data: enrollment } = await supabase.from('group_enrollments').select('*').eq('id', id).maybeSingle();
  if (!enrollment || enrollment.customer_id !== user.id) redirect('/account');
  const [{ data: offering }, { data: sessions }] = await Promise.all([
    supabase.from('group_offerings').select('*').eq('id', enrollment.offering_id).single(),
    supabase.from('group_sessions').select('*').eq('offering_id', enrollment.offering_id).order('starts_at'),
  ]);
  const { data: trainer } = offering
    ? await supabase.from('trainer_profiles').select('business_name, slug').eq('id', offering.trainer_id).single()
    : { data: null };
  if (!offering) redirect('/account');
  const firstStart = sessions?.[0]?.starts_at;
  const cancellable = ['checkout_pending','confirmed'].includes(enrollment.status) && firstStart && new Date(firstStart) > new Date();
  const statusText: Record<string,string> = { checkout_pending:'Venter på betaling', confirmed:'Påmeldt', cancelled:'Avbestilt', refunded:'Refundert', completed:'Fullført' };

  return <main className="page-shell narrow customer-page"><CustomerNavigation current="/account" /><Link className="back-link" href="/account">← Tilbake til Min side</Link><section className="booking-detail-card activity-booking-detail"><div className="booking-detail-head"><div><span className={`status ${enrollment.status === 'confirmed' ? 'confirmed' : enrollment.status}`}>{statusText[enrollment.status] || enrollment.status}</span><h1>{offering.title}</h1><p className="muted">{trainer?.business_name || 'Hundetrener'} · {enrollment.dog_name}</p></div><div className="activity-price-box compact"><span>{enrollment.payment_status === 'refunded' || enrollment.status === 'refunded' ? 'Refundert' : enrollment.payment_status === 'captured' ? 'Betalt' : 'Totalt'}</span><strong>{money(enrollment.subtotal_nok + enrollment.service_fee_nok)}</strong></div></div>{message ? <p className="form-success dashboard-flash">{message}</p> : null}{error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}<div className="activity-timeline booking-timeline">{(sessions || []).map((session,index) => <div className="activity-timeline-row" key={session.id}><span className="timeline-number">{index+1}</span><div><strong>{session.title || `Samling ${index+1}`}</strong><span>{formatOsloDateTime(session.starts_at)}</span></div></div>)}</div><div className="summary-line"><span>Aktivitet</span><strong>{money(enrollment.subtotal_nok)}</strong></div><div className="summary-line"><span>Servicegebyr</span><strong>{money(enrollment.service_fee_nok)}</strong></div>{cancellable ? <form action={cancelGroupEnrollmentAction} className="cancel-booking-form"><input type="hidden" name="enrollmentId" value={enrollment.id} /><div><strong>Avbestille?</strong><p className="muted small">I prototypeversjonen refunderes hele betalingen når du avbestiller før første samling.</p></div><button className="btn danger-button" type="submit">Avbestill og refunder</button></form> : null}</section></main>;
}
