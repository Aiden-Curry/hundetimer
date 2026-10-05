import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createTrainerClientAction, createTrainerClientDogAction, updateTrainerClientAction } from './actions';

export default async function TrainerClientsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string; q?: string }> }) {
  const { message, error, q = '' } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/clients');
  const { data: trainer } = await supabase.from('trainer_profiles').select('id').eq('id', user.id).maybeSingle();
  if (!trainer) redirect('/trainer-onboarding');

  const [{ data: clients }, { data: dogs }, { data: bookings }] = await Promise.all([
    supabase.from('trainer_clients').select('*').eq('trainer_id', user.id).order('name'),
    supabase.from('trainer_client_dogs').select('*').eq('trainer_id', user.id).order('name'),
    supabase.from('bookings').select('id,customer_id,dog_id,dog_name,requested_starts_at,status').eq('trainer_id', user.id).order('requested_starts_at', { ascending: false }),
  ]);

  const customerIds=[...new Set((bookings||[]).map(b=>b.customer_id))];
  const [{data:customerProfiles},{data:platformDogs}]=await Promise.all([
    customerIds.length?supabase.from('profiles').select('id,display_name').in('id',customerIds):Promise.resolve({data:[] as {id:string;display_name:string}[]}),
    (bookings||[]).some(b=>b.dog_id)?supabase.from('dogs').select('id,owner_id,name,breed').in('id',[...new Set((bookings||[]).map(b=>b.dog_id).filter(Boolean))] as string[]):Promise.resolve({data:[] as {id:string;owner_id:string;name:string;breed:string|null}[]}),
  ]);
  const platformDogByOwner=new Map<string,{id:string;name:string;breed:string|null}[]>();
  for(const dog of platformDogs||[]){const list=platformDogByOwner.get(dog.owner_id)||[];list.push(dog);platformDogByOwner.set(dog.owner_id,list);}
  const bookingCount=new Map<string,number>(); for(const b of bookings||[]) bookingCount.set(b.customer_id,(bookingCount.get(b.customer_id)||0)+1);

  const term = q.trim().toLocaleLowerCase('nb-NO');
  const matches = (values: (string | null | undefined)[]) => values.filter(Boolean).join(' ').toLocaleLowerCase('nb-NO').includes(term);
  const filteredPlatform = (customerProfiles || []).filter(c => matches([c.display_name, ...(platformDogByOwner.get(c.id) || []).map(d => d.name)]));
  const filteredExternal = (clients || []).filter(c => matches([c.name, c.email, c.phone, ...(dogs || []).filter(d => d.client_id === c.id).map(d => d.name)]));
  return <main className="dashboard editor-page">
    <Link className="back-link compact-back" href="/trainer-dashboard">← Til trenerdashbord</Link>
    <section className="dashboard-heading"><div><span className="eyebrow">Kunderegister</span><h1>Kunder og hunder</h1><p className="muted">Markedsplasskunder og eksterne kunder samlet på ett sted, med privattimer, hunder og treningsjournal.</p>{message ? <p className="form-success dashboard-flash">{message}</p> : null}{error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}</div><Link className="btn" href="/trainer-dashboard/calendar#new-appointment">+ Ny avtale</Link></section>

    <form action="/trainer-dashboard/clients" method="get" className="workspace-search"><label htmlFor="client-search">Finn kunde eller hund</label><div><input id="client-search" name="q" type="search" defaultValue={q} placeholder="Navn, hund, e-post eller telefon"/><button className="btn secondary" type="submit">Søk</button>{term ? <Link className="text-button" href="/trainer-dashboard/clients">Nullstill</Link> : null}</div></form>
    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Markedsplassen</span><h2>{filteredPlatform.length} kunder fra plattformen</h2><p className="muted">Disse opprettes automatisk når noen bestiller en privattime hos deg.</p></div></div>{filteredPlatform.length?<div className="trainer-client-grid">{filteredPlatform.map(customer=>{const customerDogs=platformDogByOwner.get(customer.id)||[];return <article className="trainer-client-card" key={customer.id}><div><span className="status confirmed">Plattformkunde</span><h3>{customer.display_name}</h3><p className="muted">{bookingCount.get(customer.id)||0} privattimer</p></div>{customerDogs.length?<div className="client-dog-list">{customerDogs.map(d=><span key={d.id}>🐕 {d.name}{d.breed?` · ${d.breed}`:''}</span>)}</div>:null}<Link className="btn secondary compact" href={`/trainer-dashboard/clients/platform/${customer.id}`}>Se historikk og journal</Link></article>})}</div>:<div className="empty-state compact-empty"><p className="muted">{term ? 'Ingen kunder samsvarer med søket.' : 'Ingen markedsplasskunder ennå.'}</p></div>}</section>

    <details className="workspace-disclosure" open={Boolean(error)}><summary>+ Legg til ekstern kunde eller hund</summary><div className="planner-two-col">
      <section className="editor-card"><div className="section-title"><div><span className="eyebrow">Ny ekstern kunde</span><h2>Legg til kontakt</h2></div></div><form action={createTrainerClientAction} className="form-grid editor-form-grid"><label>Navn<input name="name" required /></label><label>E-post<input name="email" type="email" /></label><label>Telefon<input name="phone" /></label><label className="full">Interne notater<textarea name="notes" rows={3} /></label><label className="checkbox-row full"><input type="checkbox" name="newsletterOptIn"/><span><strong>Kunden har samtykket til nyhetsbrev</strong><small>Bruk bare dette hvis kunden uttrykkelig har sagt ja til markedsføring på e-post.</small></span></label><div className="full"><button className="btn" type="submit">Legg til kunde</button></div></form></section>
      <section className="editor-card"><div className="section-title"><div><span className="eyebrow">Ny hund</span><h2>Legg hund til ekstern kunde</h2></div></div><form action={createTrainerClientDogAction} className="form-grid editor-form-grid"><label>Kunde<select name="clientId" required defaultValue=""><option value="" disabled>Velg kunde</option>{(clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Hundens navn<input name="name" required /></label><label>Rase<input name="breed" /></label><label>Fødselsdato<input name="birthDate" type="date" /></label><label className="full">Notater<textarea name="notes" rows={3} /></label><div className="full"><button className="btn" type="submit">Legg til hund</button></div></form></section>
    </div></details>

    <section className="dashboard-section"><div className="section-title"><div><span className="eyebrow">Eksterne kunder</span><h2>{filteredExternal.length} i eget kunderegister</h2></div></div>{filteredExternal.length ? <div className="trainer-client-grid">{filteredExternal.map((client) => { const clientDogs = (dogs || []).filter((dog) => dog.client_id === client.id); return <article className="trainer-client-card" key={client.id}><div><span className="status pending">Ekstern</span><h3>{client.name}</h3><p className="muted">{[client.email, client.phone].filter(Boolean).join(' · ') || 'Ingen kontaktinfo'}</p></div>{clientDogs.length ? <div className="client-dog-list">{clientDogs.map((dog) => <span key={dog.id}>🐕 {dog.name}{dog.breed ? ` · ${dog.breed}` : ''}</span>)}</div> : <p className="muted small">Ingen hunder registrert.</p>}<div className="booking-actions-inline"><Link className="btn secondary compact" href={`/trainer-dashboard/clients/external/${client.id}`}>Se historikk og journal</Link><details><summary>Rediger</summary><form action={updateTrainerClientAction} className="form-grid editor-form-grid compact-form"><input type="hidden" name="id" value={client.id} /><label>Navn<input name="name" defaultValue={client.name} required /></label><label>E-post<input name="email" defaultValue={client.email || ''} /></label><label>Telefon<input name="phone" defaultValue={client.phone || ''} /></label><label className="full">Notater<textarea name="notes" rows={2} defaultValue={client.notes || ''} /></label><label className="checkbox-row full"><input type="checkbox" name="newsletterOptIn" defaultChecked={Boolean(client.newsletter_opt_in)}/><span><strong>Nyhetsbrev</strong><small>Kunden har uttrykkelig samtykket.</small></span></label><div className="full"><button className="btn compact" type="submit">Lagre</button></div></form></details></div></article>; })}</div> : <div className="empty-state"><h2>{term ? 'Ingen treff' : 'Ingen eksterne kunder ennå'}</h2><p className="muted">{term ? 'Prøv et annet navn eller søk etter hunden.' : 'Legg til en kunde med knappen over.'}</p></div>}</section>
  </main>;
}
