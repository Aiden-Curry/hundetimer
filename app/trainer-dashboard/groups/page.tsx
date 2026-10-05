import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatOsloDateTime } from '@/lib/oslo-time';
import { LocationFields } from '@/components/location-fields';
import {
  addGroupSessionAction,
  addManualParticipantAction,
  removeManualParticipantAction,
  completeGroupOfferingAction,
  createGroupOfferingAction,
  deleteGroupSessionAction,
  toggleGroupOfferingAction,
  updateGroupOfferingAction,
} from './actions';

function money(value: number) { return new Intl.NumberFormat('nb-NO').format(value) + ' kr'; }

export default async function GroupManagementPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/groups');
  const { data: trainer } = await supabase.from('trainer_profiles').select('id').eq('id', user.id).maybeSingle();
  if (!trainer) redirect('/trainer-onboarding');

  const [{ data: offerings }, { data: sessions }, { data: enrollments }, { data: waitlist }, { data: manualParticipants }, { data: clients }, { data: clientDogs }] = await Promise.all([
    supabase.from('group_offerings').select('*').eq('trainer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('group_sessions').select('*').order('starts_at'),
    supabase.from('group_enrollments').select('id, offering_id, status, dog_name, subtotal_nok, customer_id').order('created_at'),
    supabase.from('group_waitlist').select('id, offering_id, status, dog_name, joined_at, offered_at, offer_expires_at').order('joined_at'),
    supabase.from('group_manual_participants').select('*').eq('trainer_id', user.id).order('created_at'),
    supabase.from('trainer_clients').select('id,name').eq('trainer_id', user.id).order('name'),
    supabase.from('trainer_client_dogs').select('id,client_id,name').eq('trainer_id', user.id).order('name'),
  ]);

  const offeringIds = new Set((offerings || []).map((o) => o.id));
  const relevantSessions = (sessions || []).filter((s) => offeringIds.has(s.offering_id));
  const relevantEnrollments = (enrollments || []).filter((e) => offeringIds.has(e.offering_id));
  const relevantWaitlist = (waitlist || []).filter((w) => offeringIds.has(w.offering_id));
  const relevantManual = (manualParticipants || []).filter((p) => offeringIds.has(p.offering_id));
  const clientMap = new Map((clients || []).map((c) => [c.id, c.name]));

  return <main className="dashboard editor-page group-manager-page">
    <Link className="back-link compact-back" href="/trainer-dashboard">← Tilbake til trenerdashboard</Link>
    <section className="dashboard-heading"><div><span className="eyebrow">Kurs og arrangementer</span><h1>Kurs og arrangementer</h1><p className="muted">Opprett valpekurs, workshops, seminarer, fellesturer og andre aktiviteter med et fast antall plasser.</p>{message ? <p className="form-success dashboard-flash">{message}</p> : null}{error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}</div><Link className="btn secondary" href="/discover?type=activities">Se offentlig oversikt</Link></section>

    <details className="workspace-disclosure" open={!offerings?.length || Boolean(error)}><summary>+ Opprett kurs eller arrangement</summary><section className="editor-card group-create-card">
      <div className="section-title"><div><span className="eyebrow">Ny aktivitet</span><h2>Opprett kurs eller arrangement</h2></div></div>
      <form action={createGroupOfferingAction} className="form-grid editor-form-grid group-offering-form">
        <label>Type<select name="kind" defaultValue="course"><option value="course">Kurs</option><option value="event">Arrangement</option></select></label>
        <label>Tittel<input name="title" required placeholder="For eksempel Valpekurs grunnkurs" /></label>
        <label className="full">Beskrivelse<textarea name="description" rows={4} placeholder="Hva lærer deltakerne, hvem passer det for, og hva bør de ta med?" /></label>
        <label className="full">Emner, separert med komma<input name="tags" placeholder="Valp, passering, innkalling" /></label>
        <label>Sted/by<input name="city" required placeholder="Hamar" /></label>
        <label>Lokale/sted<input name="venueName" placeholder="Hundehallen" /></label>
        <label className="full">Adresse<input name="address" placeholder="Gateadresse (valgfritt)" /></label>
        <div className="full"><LocationFields /></div>
        <label>Pris per hund<input name="priceNok" required type="number" min="0" defaultValue="1995" /></label>
        <label>Antall plasser<input name="capacity" required type="number" min="1" max="500" defaultValue="8" /></label>
        <label>Første start<input name="startsAt" required type="datetime-local" /></label>
        <label>Første slutt<input name="endsAt" required type="datetime-local" /></label>
        <label className="checkbox-label full"><input name="isOnline" type="checkbox" /> Dette er et nettbasert kurs/arrangement</label>
        <div className="full editor-actions"><button className="btn" type="submit">Opprett</button></div>
      </form>
    </section></details>

    <section className="dashboard-section">
      <div className="section-title"><div><span className="eyebrow">Dine aktiviteter</span><h2>{(offerings || []).length ? `${offerings!.length} publiserte eller lagrede` : 'Ingen ennå'}</h2></div></div>
      {(offerings || []).length ? <div className="group-admin-list">{offerings!.map((offering) => {
        const offeringSessions = relevantSessions.filter((s) => s.offering_id === offering.id);
        const offeringEnrollments = relevantEnrollments.filter((e) => e.offering_id === offering.id && ['confirmed','completed'].includes(e.status));
        const offeringWaitlist = relevantWaitlist.filter((w) => w.offering_id === offering.id && ['waiting','offered','checkout'].includes(w.status));
        const offeringManual = relevantManual.filter((p) => p.offering_id === offering.id && p.status === 'active');
        const lastSession = offeringSessions[offeringSessions.length - 1];
        const canComplete = Boolean(lastSession && new Date(lastSession.ends_at) < new Date() && !offering.completed_at);
        return <article className={`group-admin-card ${offering.active ? '' : 'inactive'}`} key={offering.id}>
          <div className="group-admin-head"><div><span className={`activity-kind ${offering.kind}`}>{offering.kind === 'course' ? 'Kurs' : 'Arrangement'}</span><h3>{offering.title}</h3><p className="muted">{offering.city} · {offering.is_online ? 'På nett' : (offering.venue_name || 'Sted ikke angitt')}</p></div><div className="group-admin-numbers"><strong>{money(offering.price_nok)}</strong><span>{offering.confirmed_count}/{offering.capacity} påmeldt</span></div></div>
          {offering.description ? <p>{offering.description}</p> : null}

          <div className="group-session-list"><strong>Datoer</strong>{offeringSessions.map((session, index) => <div className="group-session-row" key={session.id}><div><span className="session-index">{index + 1}</span><span>{session.title || `Samling ${index + 1}`} · {formatOsloDateTime(session.starts_at)}</span></div>{offering.confirmed_count === 0 ? <form action={deleteGroupSessionAction}><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="offeringId" value={offering.id} /><button className="text-button danger-text" type="submit">Fjern</button></form> : null}</div>)}</div>

          <details className="group-admin-details"><summary>Rediger detaljer</summary><form action={updateGroupOfferingAction} className="form-grid editor-form-grid compact-form"><input type="hidden" name="id" value={offering.id} /><label>Type<select name="kind" defaultValue={offering.kind}><option value="course">Kurs</option><option value="event">Arrangement</option></select></label><label>Tittel<input name="title" required defaultValue={offering.title} /></label><label className="full">Beskrivelse<textarea name="description" rows={3} defaultValue={offering.description || ''} /></label><label className="full">Emner<input name="tags" defaultValue={(offering.tags || []).join(', ')} placeholder="Valp, nosework, passering" /></label><label>By<input name="city" required defaultValue={offering.city} /></label><label>Sted<input name="venueName" defaultValue={offering.venue_name || ''} /></label><label className="full">Adresse<input name="address" defaultValue={offering.address || ''} /></label><div className="full"><LocationFields initialLat={offering.latitude} initialLng={offering.longitude} compact /></div><label>Pris<input name="priceNok" type="number" min="0" required defaultValue={offering.price_nok} /></label><label>Kapasitet<input name="capacity" type="number" min={offering.confirmed_count || 1} max="500" required defaultValue={offering.capacity} /></label><label className="checkbox-label full"><input name="isOnline" type="checkbox" defaultChecked={offering.is_online} /> Nettbasert</label><div className="full"><button className="btn compact" type="submit">Lagre endringer</button></div></form></details>

          <details className="group-admin-details"><summary>Legg til en ny samling</summary><form action={addGroupSessionAction} className="group-session-form"><input type="hidden" name="offeringId" value={offering.id} /><input aria-label="Navn på samling" name="title" placeholder="Navn (valgfritt)" /><input aria-label="Starttid" name="startsAt" type="datetime-local" required /><input aria-label="Sluttid" name="endsAt" type="datetime-local" required /><button className="btn compact" type="submit">Legg til</button></form></details>

          {offeringEnrollments.length ? <details className="group-admin-details"><summary>Markedsplass-påmeldte ({offeringEnrollments.length})</summary><div className="group-enrollment-mini-list">{offeringEnrollments.map((enrollment) => <div key={enrollment.id}><span>🐕 {enrollment.dog_name}</span><strong>{money(enrollment.subtotal_nok)}</strong></div>)}</div></details> : null}

          <details className="group-admin-details"><summary>Eksterne deltakere ({offeringManual.length})</summary><div className="external-participant-panel">{offeringManual.length ? <div className="group-enrollment-mini-list">{offeringManual.map((participant) => <div key={participant.id}><span>🐕 {participant.dog_name} · {participant.customer_name}</span><span>{participant.payment_status === 'paid_external' ? 'Betalt eksternt' : participant.payment_status === 'free' ? 'Gratis' : 'Ikke betalt'}</span><form action={removeManualParticipantAction}><input type="hidden" name="participantId" value={participant.id} /><button className="text-button danger-text" type="submit">Fjern</button></form></div>)}</div> : <p className="muted small">Ingen eksterne deltakere.</p>}<form action={addManualParticipantAction} className="form-grid editor-form-grid compact-form manual-participant-form"><input type="hidden" name="offeringId" value={offering.id} /><label>Lagret kunde<select name="clientId" defaultValue=""><option value="">Velg eller skriv manuelt</option>{(clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Lagret hund<select name="dogId" defaultValue=""><option value="">Velg eller skriv manuelt</option>{(clientDogs || []).map((dog) => <option key={dog.id} value={dog.id}>{clientMap.get(dog.client_id) || 'Kunde'} · {dog.name}</option>)}</select></label><label>Kundenavn<input name="customerName" placeholder="Hvis ikke lagret" /></label><label>Hundens navn<input name="dogName" placeholder="Hvis ikke lagret" /></label><label>Kilde<select name="source" defaultValue="facebook"><option value="phone">Telefon</option><option value="facebook">Facebook</option><option value="email">E-post</option><option value="direct">Direkte</option><option value="other">Annet</option></select></label><label>Betaling<select name="paymentStatus" defaultValue="paid_external"><option value="unpaid">Ikke betalt</option><option value="paid_external">Betalt eksternt</option><option value="free">Gratis</option></select></label><label>Pris<input name="priceNok" type="number" min="0" defaultValue={offering.price_nok} /></label><label className="full">Notat<input name="notes" /></label><div className="full"><button className="btn compact" type="submit">Legg til deltaker</button></div></form><p className="muted tiny">Eksterne deltakere bruker en plass, men utløser ingen markedsplassprovisjon eller plattformutbetaling.</p></div></details>

          {offeringWaitlist.length ? <details className="group-admin-details"><summary>Venteliste ({offeringWaitlist.length})</summary><div className="group-enrollment-mini-list waitlist-admin-list">{offeringWaitlist.map((entry, index) => <div key={entry.id}><span>🐕 {entry.dog_name}</span><strong>{entry.status === 'offered' ? `Plass tilbudt til ${entry.offer_expires_at ? formatOsloDateTime(entry.offer_expires_at) : ''}` : entry.status === 'checkout' ? 'Betaler nå' : `Nr. ${offeringWaitlist.filter((w) => w.status === 'waiting').findIndex((w) => w.id === entry.id) + 1} i køen`}</strong></div>)}</div></details> : null}

          <div className="group-admin-actions"><form action={toggleGroupOfferingAction}><input type="hidden" name="id" value={offering.id} /><input type="hidden" name="active" value={String(!offering.active)} /><button className="btn secondary compact" type="submit">{offering.active ? 'Skjul fra markedet' : 'Publiser igjen'}</button></form>{canComplete ? <form action={completeGroupOfferingAction}><input type="hidden" name="id" value={offering.id} /><button className="btn compact" type="submit">Marker hele aktiviteten fullført</button></form> : null}{offering.completed_at ? <span className="status confirmed">Fullført</span> : null}</div>
        </article>;
      })}</div> : <div className="empty-state"><h2>Lag ditt første kurs</h2><p className="muted">Bruk skjemaet over. Et kurs kan ha én eller flere samlinger.</p></div>}
    </section>
  </main>;
}
