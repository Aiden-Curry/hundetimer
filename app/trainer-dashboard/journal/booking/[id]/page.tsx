import { SubmitButton } from '@/components/submit-button';
const statusLabel: Record<string,string> = { confirmed: 'Bekreftet', completed: 'Fullført', pending: 'Venter på bekreftelse', reschedule_offered: 'Ny tid foreslått', cancelled_by_customer: 'Avbestilt', declined_by_trainer: 'Avslått', refunded: 'Refundert', cancelled: 'Avlyst', active: 'Aktiv', phone: 'Telefon', facebook: 'Facebook', email: 'E-post', direct: 'Direkte', other: 'Annet', unpaid: 'Ikke betalt', paid_external: 'Betalt eksternt', free: 'Gratis' };
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { saveBookingJournalAction } from '../../actions';

function dateTime(value: string) { return new Intl.DateTimeFormat('nb-NO',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(value)); }

export default async function BookingJournalPage({ params, searchParams }: { params: Promise<{ id:string }>; searchParams: Promise<{message?:string;error?:string}> }) {
  const { id } = await params; const {message,error}=await searchParams;
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect(`/login?next=${encodeURIComponent(`/trainer-dashboard/journal/booking/${id}`)}`);
  const admin=createAdminClient();
  const {data:booking}=await admin.from('bookings').select('id,trainer_id,customer_id,dog_id,dog_name,service_id,requested_starts_at,status').eq('id',id).maybeSingle();
  if(!booking || booking.trainer_id!==user.id) notFound();
  const [{data:customer},{data:service},dogResult,{data:journal}]=await Promise.all([
    admin.from('profiles').select('display_name').eq('id',booking.customer_id).maybeSingle(),
    admin.from('services').select('title,duration_minutes').eq('id',booking.service_id).maybeSingle(),
    booking.dog_id?admin.from('dogs').select('name,breed,birth_date,notes').eq('id',booking.dog_id).maybeSingle():Promise.resolve({data:null}),
    admin.from('trainer_lesson_journals').select('*').eq('booking_id',booking.id).maybeSingle(),
  ]);
  const {data:shared}=journal?await admin.from('lesson_shared_notes').select('*').eq('journal_id',journal.id).maybeSingle():{data:null};
  const dog=dogResult.data;
  return <main className="dashboard editor-page journal-editor-page">
    <Link className="back-link" href="/trainer-dashboard/calendar">← Til kalender</Link>
    <section className="dashboard-heading"><div><span className="eyebrow">Treningsjournal</span><h1>{booking.dog_name || dog?.name || 'Hund'} · {service?.title || 'Privattime'}</h1><p className="muted">{customer?.display_name || 'Kunde'} · {dateTime(booking.requested_starts_at)}</p></div><div className="dashboard-heading-actions"><Link className="btn secondary" href={`/booking/${booking.id}`}>Se bestilling</Link><Link className="btn secondary" href={`/trainer-dashboard/clients/platform/${booking.customer_id}`}>Kundehistorikk</Link></div></section>
    {message?<p className="form-success dashboard-flash">{message}</p>:null}{error?<p className="form-error form-error-block dashboard-flash">{error}</p>:null}
    <div className="journal-context-grid"><article className="editor-card"><span className="eyebrow">Kunde</span><h3>{customer?.display_name || 'Kunde'}</h3><p>{dog?.name || booking.dog_name || 'Hund'}{dog?.breed?` · ${dog.breed}`:''}</p>{dog?.notes?<p className="muted">{dog.notes}</p>:null}</article><article className="editor-card"><span className="eyebrow">Time</span><h3>{service?.title || 'Privattime'}</h3><p>{dateTime(booking.requested_starts_at)}{service?.duration_minutes?` · ${service.duration_minutes} min`:''}</p><p className="muted">Status: {statusLabel[booking.status] || 'Ukjent status'}</p></article></div>
    <form action={saveBookingJournalAction} className="journal-form">
      <input type="hidden" name="bookingId" value={booking.id}/>
      <section className="editor-card"><span className="eyebrow">Plan og mål</span><h2>Hva jobbet dere med?</h2><label>Mål / tema<textarea name="goals" rows={4} defaultValue={journal?.goals || ''} placeholder="For eksempel passering, kontakt, ro på matte..."/></label></section>
      <section className="editor-card journal-private-card"><span className="eyebrow">Kun for treneren</span><h2>Private journalnotater</h2><p className="muted">Dette vises aldri til kunden.</p><label>Interne observasjoner<textarea name="privateNotes" rows={8} defaultValue={journal?.private_notes || ''} placeholder="Observasjoner, vurderinger og ting du vil huske til neste time."/></label></section>
      <section className="editor-card journal-shared-card"><span className="eyebrow">Del med kunden</span><h2>Oppsummering og hjemmeoppgaver</h2><p className="muted">Med deling slått på får kunden varsel når du lagrer en ny eller endret kundeoppsummering. Private notater deles ikke.</p><label>Oppsummering<textarea name="sharedSummary" rows={6} defaultValue={shared?.shared_summary || ''} placeholder="Hva gikk dere gjennom, og hva fungerte bra?"/></label><label>Hjemmeoppgaver<textarea name="homework" rows={5} defaultValue={shared?.homework || ''} placeholder="Konkrete øvelser kunden skal gjøre hjemme."/></label><label>Neste steg<textarea name="nextSteps" rows={4} defaultValue={shared?.next_steps || ''} placeholder="Hva bør dere fokusere på videre?"/></label><label className="checkbox-label"><input name="publishShared" type="checkbox" defaultChecked={Boolean(shared?.published_at)}/> Del disse notatene med kunden på Min side</label>{shared?.published_at?<p className="muted small">Delt siden {dateTime(shared.published_at)}</p>:null}</section>
      <div className="journal-save-bar"><SubmitButton className="btn" type="submit">Lagre journal</SubmitButton><span className="muted small">Private notater og kundedeling lagres separat.</span></div>
    </form>
  </main>;
}
