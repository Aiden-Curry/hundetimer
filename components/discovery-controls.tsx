'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

export function DiscoveryImage({ src, fallback }: { src: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0) setFailed(true);
  }, []);
  return failed ? fallback : <img ref={image} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function DiscoveryFilters({ children, count }: { children: ReactNode; count: number }) {
  const [open, setOpen] = useState(false);
  return <aside className="discover-filters" aria-label="Søkefiltre">
    <button className="discover-filter-toggle" type="button" aria-expanded={open} aria-controls="discover-filter-fields" onClick={() => setOpen(!open)}>
      <SlidersHorizontal size={18} aria-hidden="true" /> Filtre {count > 0 && <span>{count}</span>}<ChevronDown size={18} aria-hidden="true" className={open ? 'is-expanded' : ''} />
    </button>
    <div id="discover-filter-fields" className={`discover-filter-fields${open ? ' is-open' : ''}`}>{children}</div>
  </aside>;
}

export function DiscoverySort({ value, returnPath, hasLocation, onlineOnly }: { value: string; returnPath: string; hasLocation: boolean; onlineOnly: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="discover-sort">Sorter etter
    <select name="sort" form="discover-search" value={value} disabled={pending} onChange={event => {
      const url = new URL(returnPath, window.location.origin);
      if (event.target.value === 'recommended') url.searchParams.delete('sort');
      else url.searchParams.set('sort', event.target.value);
      startTransition(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
    }}>
      <option value="recommended">Anbefalt</option><option value="price">Laveste pris</option><option value="rating">Beste vurdering</option>
      {!onlineOnly && <option value="soon">Først ledig / oppstart</option>}
      {!onlineOnly && <option value="nearest" disabled={!hasLocation}>Nærmest{!hasLocation ? ' (velg posisjon)' : ''}</option>}
    </select>
    <span className="discover-sr-only" role="status">{pending ? 'Oppdaterer resultater…' : ''}</span>
  </label>;
}
