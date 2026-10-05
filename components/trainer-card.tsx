import Link from 'next/link';
import { SaveButton } from '@/components/save-button';

export type TrainerCardData = {
  id: string;
  slug: string;
  name: string;
  city: string;
  specialties: string[];
  bio: string;
  verified: boolean;
  profileImageUrl?: string | null;
  fromPrice?: number | null;
  nextAvailable?: string | null;
  demoMeta?: string | null;
  ratingAverage?: number | null;
  reviewCount?: number;
};

type SaveState = { saved:boolean; canSave:boolean; returnPath:string } | null;

function formatNext(value: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
  }).format(new Date(value));
}

export function TrainerCard({ trainer, saveState = null }: { trainer: TrainerCardData; saveState?: SaveState }) {
  return (
    <article className="trainer-card">
      {saveState ? <SaveButton itemType="trainer" itemId={trainer.id} saved={saveState.saved} canSave={saveState.canSave} returnPath={saveState.returnPath} /> : null}
      <div className="avatar trainer-card-avatar" aria-hidden={!trainer.profileImageUrl}>
        {trainer.profileImageUrl ? <img src={trainer.profileImageUrl} alt={`${trainer.name} profilbilde`} /> : trainer.name.slice(0, 1)}
      </div>
      <div className="trainer-main">
        <div className="row start">
          <div>
            <div className="eyebrow">{trainer.city}{trainer.demoMeta ? ` · ${trainer.demoMeta}` : ''}</div>
            <h3>{trainer.name} {trainer.verified ? <span className="verified">✓</span> : null}</h3>
            {trainer.reviewCount ? <div className="trainer-rating-summary"><span className="stars-inline">★</span><strong>{trainer.ratingAverage?.toFixed(1)}</strong><span>({trainer.reviewCount} vurderinger)</span></div> : <div className="trainer-rating-summary muted">Ingen vurderinger ennå</div>}
          </div>
          {trainer.nextAvailable ? <div className="next-available"><span>Neste ledige</span><strong>{formatNext(trainer.nextAvailable)}</strong></div> : null}
        </div>
        <p className="muted">{trainer.bio || 'Hundetrener med bestillbare tjenester.'}</p>
        <div className="chips">{trainer.specialties.slice(0, 4).map((specialty) => <span className="chip" key={specialty}>{specialty}</span>)}</div>
        <div className="card-footer">
          <div>{trainer.fromPrice != null ? <><span className="muted small">Fra</span><strong>{trainer.fromPrice} kr</strong></> : <span className="muted small">Se tjenester og tilgjengelighet</span>}</div>
          <Link className="btn" href={`/trainers/${trainer.slug}`}>Se hundetrener</Link>
        </div>
      </div>
    </article>
  );
}
