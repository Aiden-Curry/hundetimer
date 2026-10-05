import { SubmitButton } from '@/components/submit-button';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { replyToReviewAction } from '@/app/reviews/actions';

function dateOnly(value: string) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(value));
}

export default async function TrainerReviewsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/trainer-dashboard/reviews');

  const [{ data: profile }, { data: reviews }, { data: services }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('reviews').select('id, customer_id, service_id, rating, comment, trainer_reply, created_at').eq('trainer_id', user.id).eq('moderation_status', 'visible').order('created_at', { ascending: false }),
    supabase.from('services').select('id, title').eq('trainer_id', user.id),
  ]);
  if (profile?.role !== 'trainer') redirect('/');

  const customerIds = [...new Set((reviews || []).map((review) => review.customer_id))];
  const { data: customers } = customerIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', customerIds)
    : { data: [] as { id: string; display_name: string }[] };
  const customerMap = new Map((customers || []).map((customer) => [customer.id, customer.display_name]));
  const serviceMap = new Map((services || []).map((service) => [service.id, service.title]));
  const count = (reviews || []).length;
  const average = count ? (reviews || []).reduce((sum, review) => sum + review.rating, 0) / count : 0;

  return (
    <main className="dashboard trainer-subpage">
      <section className="dashboard-heading trainer-subpage-heading">
        <div><span className="eyebrow">Vurderinger</span><h1>Kundetilbakemeldinger</h1><p className="muted">Følg med på omdømmet ditt og svar offentlig på verifiserte vurderinger.</p></div>
      </section>
      {message ? <p className="form-success dashboard-flash">{message}</p> : null}
      {error ? <p className="form-error form-error-block dashboard-flash">{error}</p> : null}

      <section className="trainer-review-summary">
        <div><strong>{count ? average.toFixed(1) : '–'}</strong><span className="trainer-review-stars">{count ? `${'★'.repeat(Math.round(average))}${'☆'.repeat(5-Math.round(average))}` : 'Ingen vurderinger'}</span></div>
        <p><strong>{count}</strong> verifiserte vurderinger</p>
      </section>

      <section className="trainer-review-manage-list">
        {(reviews || []).length ? (reviews || []).map((review) => (
          <article className="trainer-review-manage-card" key={review.id}>
            <div className="trainer-review-manage-meta">
              <div><span className="trainer-review-stars">{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</span><strong>{customerMap.get(review.customer_id) || 'Kunde'}</strong></div>
              <small>{serviceMap.get(review.service_id) || 'Tjeneste'} · {dateOnly(review.created_at)}</small>
            </div>
            <p className="trainer-review-comment">{review.comment || 'Vurdering uten kommentar.'}</p>
            {review.trainer_reply ? <div className="trainer-existing-reply"><strong>Ditt svar</strong><p>{review.trainer_reply}</p></div> : null}
            <details open={!review.trainer_reply}><summary>{review.trainer_reply ? 'Rediger svaret ditt' : 'Svar på vurderingen'}</summary><form action={replyToReviewAction} className="trainer-review-reply-form">
              <input type="hidden" name="reviewId" value={review.id} />
              <textarea aria-label="Ditt offentlige svar på vurderingen" name="reply" rows={3} defaultValue={review.trainer_reply || ''} placeholder="Skriv et offentlig svar..." />
              <SubmitButton className="btn secondary compact" type="submit">{review.trainer_reply ? 'Oppdater svar' : 'Svar på vurdering'}</SubmitButton>
            </form></details>
          </article>
        )) : <div className="empty-state"><h3>Ingen vurderinger ennå</h3><p className="muted">Når en kunde fullfører en betalt time kan de legge igjen en verifisert vurdering.</p></div>}
      </section>
    </main>
  );
}
