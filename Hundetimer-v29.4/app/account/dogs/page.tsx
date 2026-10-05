import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { deleteDogAction, saveDogAction } from './actions';

function ageText(birthDate: string | null) {
  if (!birthDate) return 'Alder ikke oppgitt';
  const birth = new Date(`${birthDate}T12:00:00`);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return 'Fødselsdato i fremtiden';
  if (months < 24) return `${months} ${months === 1 ? 'måned' : 'måneder'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'år' : 'år'}`;
}

const sexText: Record<string, string> = { female: 'Tispe', male: 'Hannhund', unknown: 'Ikke oppgitt' };

export default async function DogsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const { error, message, next } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/account/dogs')}`);

  const [{ data: profile }, { data: dogs }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('dogs').select('id, name, breed, birth_date, sex, weight_kg, notes').eq('owner_id', user.id).order('created_at'),
  ]);
  if (profile?.role === 'trainer') redirect('/trainer-dashboard');

  return (
    <main className="page-shell narrow dogs-page">
      <section className="page-heading">
        <Link className="back-link compact-back" href="/account">← Tilbake til Min side</Link>
        <span className="eyebrow">Mine hunder</span>
        <h1>Hundene dine</h1>
        <p className="muted">Lagre hundene én gang. Når du bestiller trening velger du bare hvilken hund timen gjelder.</p>
      </section>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error form-error-block">{error}</p> : null}

      <section className="dashboard-section dog-create-card">
        <div className="section-title"><div><span className="eyebrow">Ny hund</span><h2>Legg til hund</h2></div></div>
        <form action={saveDogAction} className="form-grid dog-form">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label>Navn<input name="name" required maxLength={80} placeholder="Whimsy" /></label>
          <label>Rase<input name="breed" maxLength={120} placeholder="Rough Collie" /></label>
          <label>Fødselsdato<input type="date" name="birthDate" /></label>
          <label>Kjønn<select name="sex" defaultValue="unknown"><option value="unknown">Ikke oppgitt</option><option value="female">Tispe</option><option value="male">Hannhund</option></select></label>
          <label>Vekt i kg<input type="number" name="weightKg" min="0.1" max="250" step="0.1" inputMode="decimal" placeholder="18,5" /></label>
          <label className="full">Om hunden<textarea name="notes" rows={4} maxLength={1500} placeholder="For eksempel temperament, tidligere trening eller ting en trener bør vite." /></label>
          <div className="full"><button className="btn" type="submit">Lagre hund</button></div>
        </form>
      </section>

      <section className="dashboard-section">
        <div className="section-title"><div><span className="eyebrow">Profiler</span><h2>{dogs?.length || 0} {(dogs?.length || 0) === 1 ? 'hund' : 'hunder'}</h2></div></div>
        <div className="dog-profile-list">
          {(dogs || []).length ? dogs!.map((dog) => (
            <article className="dog-profile-card" key={dog.id}>
              <div className="dog-profile-summary">
                <div className="dog-avatar-placeholder">🐕</div>
                <div><h3>{dog.name}</h3><p className="muted">{dog.breed || 'Rase ikke oppgitt'} · {ageText(dog.birth_date)} · {sexText[dog.sex] || 'Ikke oppgitt'}</p>{dog.weight_kg ? <span className="dog-chip">{Number(dog.weight_kg).toLocaleString('nb-NO')} kg</span> : null}</div>
              </div>
              <details className="dog-edit-details">
                <summary>Rediger</summary>
                <form action={saveDogAction} className="form-grid dog-form dog-edit-form">
                  <input type="hidden" name="id" value={dog.id} />
                  <label>Navn<input name="name" required maxLength={80} defaultValue={dog.name} /></label>
                  <label>Rase<input name="breed" maxLength={120} defaultValue={dog.breed || ''} /></label>
                  <label>Fødselsdato<input type="date" name="birthDate" defaultValue={dog.birth_date || ''} /></label>
                  <label>Kjønn<select name="sex" defaultValue={dog.sex}><option value="unknown">Ikke oppgitt</option><option value="female">Tispe</option><option value="male">Hannhund</option></select></label>
                  <label>Vekt i kg<input type="number" name="weightKg" min="0.1" max="250" step="0.1" defaultValue={dog.weight_kg ?? ''} /></label>
                  <label className="full">Om hunden<textarea name="notes" rows={4} maxLength={1500} defaultValue={dog.notes || ''} /></label>
                  <div className="full dog-card-actions"><button className="btn compact" type="submit">Lagre endringer</button></div>
                </form>
                <form action={deleteDogAction} className="dog-delete-form"><input type="hidden" name="id" value={dog.id} /><button className="text-button danger-text" type="submit">Fjern hund</button></form>
              </details>
            </article>
          )) : <div className="empty-state"><div className="empty-icon">🐾</div><h3>Ingen hunder lagt til ennå</h3><p className="muted">Legg til den første hunden over. Deretter kan du velge den direkte når du bestiller.</p></div>}
        </div>
      </section>
    </main>
  );
}
