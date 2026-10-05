import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function dateTime(value:string){return new Intl.DateTimeFormat('nb-NO',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Oslo'}).format(new Date(value));}

export default async function PlatformClientHistoryPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect(`/login?next=${encodeURIComponent(`/trainer-dashboard/clients/platform/${id}`)}`);
  const admin=createAdminClient(); const {data:trainer}=await admin.from('trainer_profiles').select('id').eq('id',user.id).maybeSingle(); if(!trainer) redirect('/account');
  const {data:bookings}=await admin.from('bookings').select('id,dog_id,dog_name,service_id,requested_starts_at,status,subtotal_nok').eq('trainer_id',user.id).eq('customer_id',id).order('requested_starts_at',{ascending:false});
  if(!bookings?.length) notFound();
  const [{data:profile},serviceResult,{data:journals}]=await Promise.all([
    admin.from('profiles').select('id,display_name').eq('id',id).maybeSingle(),
    admin.from('services').select('id,title').eq('trainer_id',user.id),
    admin.from('trainer_lesson_journals').select('*').eq('trainer_id',user.id).eq('platform_customer_id',id).order('occurred_at',{ascending:false}),
  ]);
  const dogIds=[...new Set(bookings.map(b=>b.dog_id).filter(Boolean))] as string[];
  const {data:dogs}=dogIds.length?await admin.from('dogs').select('id,name,breed,birth_date,notes').in('id',dogIds):{data:[] as any[]};
  const journalIds=(journals||[]).map(j=>j.id); const {data:shared}=journalIds.length?await admin.from('lesson_shared_notes').select('*').in('journal_id',journalIds):{data:[] as any[]};
  const serviceMap=new Map((serviceResult.data||[]).map(s=>[s.id,s.title])); const dogMap=new Map((dogs||[]).map(d=>[d.id,d])); const journalByBooking=new Map((journals||[]).filter(j=>j.booking_id).map(j=>[j.booking_id,j])); const sharedByJournal=new Map((shared||[]).map(s=>[s.journal_id,s]));
  return <main className="dashboard client-history-page"><Link className="back-link" href="/trainer-dashboard/clients">← Til kunderegister</Link><section className="dashboard-heading"><div><span className="eyebrow">Markedsplasskunde</span><h1>{profile?.display_name||'Kunde'}</h1><p className="muted">{bookings.length} privattime{bookings.length===1?'':'r'} hos deg.</p></div><Link className="btn" href="/trainer-dashboard/calendar">Åpne kalender</Link></section>
  {dogs?.length?<section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Hunder</span><h2>Hundekort</h2></div></div><div className="trainer-client-grid">{dogs.map(d=><article className="trainer-client-card" key={d.id}><h3>🐕 {d.name}</h3><p className="muted">{d.breed||'Rase ikke oppgitt'}{d.birth_date?` · født ${new Intl.DateTimeFormat('nb-NO').format(new Date(`${d.birth_date}T12:00:00`))}`:''}</p>{d.notes?<p>{d.notes}</p>:null}</article>)}</div></section>:null}
  <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Historikk</span><h2>Privattimer og journal</h2></div></div><div className="journal-timeline">{bookings.map(booking=>{const journal=journalByBooking.get(booking.id);const share=journal?sharedByJournal.get(journal.id):null;const dog=booking.dog_id?dogMap.get(booking.dog_id):null;return <article className="journal-timeline-card" key={booking.id}><div className="journal-timeline-date"><strong>{dateTime(booking.requested_starts_at)}</strong><span>{serviceMap.get(booking.service_id)||'Privattime'} · {dog?.name||booking.dog_name||'Hund'}</span></div><div className="journal-timeline-body">{journal?.goals?<p><strong>Jobbet med:</strong> {journal.goals}</p>:null}{journal?.private_notes?<p className="journal-private-preview"><strong>Privat notat:</strong> {journal.private_notes}</p>:null}{share?.shared_summary?<p><strong>Kundeoppsummering:</strong> {share.shared_summary}</p>:null}{share?.homework?<p><strong>Hjemmeoppgave:</strong> {share.homework}</p>:null}{!journal?<p className="muted">Ingen journal skrevet ennå.</p>:null}</div><Link className="btn secondary compact" href={`/trainer-dashboard/journal/booking/${booking.id}`}>{journal?'Åpne journal':'Skriv journal'}</Link></article>})}</div></section></main>;
}
