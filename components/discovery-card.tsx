import Link from 'next/link';
import { ArrowUpRight, BookOpen, CalendarDays, MapPin, ShieldCheck, Star, Video } from 'lucide-react';
import { SaveButton } from '@/components/save-button';
import { DiscoveryImage } from '@/components/discovery-controls';

type Props = {
  id: string;
  kind: 'trainer' | 'activity' | 'online_course';
  category: string;
  title: string;
  href: string;
  image?: string | null;
  description: string;
  location: string;
  detail: string;
  provider?: string;
  price: number | null;
  rating: number | null;
  reviewCount: number;
  verified?: boolean;
  tags: string[];
  availability?: string;
  full?: boolean;
  save: { saved: boolean; canSave: boolean; returnPath: string } | null;
};

export function DiscoveryCard(props: Props) {
  const { kind, title, href, category, image, price, rating, reviewCount } = props;
  const Icon = kind === 'online_course' ? Video : CalendarDays;
  const fallback = kind === 'trainer' ? <span>{title.slice(0, 1)}</span> : <Icon size={26} strokeWidth={1.5} />;
  return <article className={`discover-card discover-card-${kind}`}>
    <div className="discover-card-heading">
      <Link href={href} className={`discover-card-image${image ? ' has-image' : ''}`} tabIndex={-1} aria-hidden="true">
        {image ? <DiscoveryImage key={image} src={image} fallback={fallback} /> : fallback}
      </Link>
      <div className="discover-card-identity"><span className="discover-card-category">{category}</span><h3><Link href={href}>{title}</Link></h3></div>
      {props.save && <SaveButton itemType={kind} itemId={props.id} {...props.save} />}
    </div>
    {kind === 'trainer' ? <div className="discover-card-rating">{reviewCount > 0 && rating != null ? <><Star size={14} aria-hidden="true" /><strong>{rating.toFixed(1).replace('.', ',')}</strong><span>({reviewCount} {reviewCount === 1 ? 'vurdering' : 'vurderinger'})</span></> : <span>Ingen vurderinger ennå</span>}{props.verified && <span className="discover-verified"><ShieldCheck size={14} aria-hidden="true" /> Verifisert</span>}</div> : <p className="discover-provider">{props.provider}</p>}
    <p className="discover-card-description">{props.description}</p>
    <div className="discover-card-facts"><span><MapPin size={15} aria-hidden="true" />{props.location}</span>{props.detail && <span>{kind === 'online_course' ? <BookOpen size={15} aria-hidden="true" /> : <CalendarDays size={15} aria-hidden="true" />}{props.detail}</span>}</div>
    {props.tags.length > 0 && <div className="discover-card-tags">{props.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>}
    <div className="discover-card-footer"><div>{price == null ? <span>Se tjenester</span> : <><span>{kind === 'trainer' ? 'Fra ' : ''}</span><strong>{new Intl.NumberFormat('nb-NO').format(price)} kr</strong></>}{props.availability && <small className={props.full ? 'is-full' : ''}>{props.availability}</small>}</div><Link className="discover-card-action" href={href}>{kind === 'trainer' ? 'Se trener' : kind === 'online_course' ? 'Se nettkurs' : 'Se aktivitet'}<ArrowUpRight size={17} aria-hidden="true" /></Link></div>
  </article>;
}
