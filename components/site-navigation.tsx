'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

function PublicLinks({ queryAware = false }: { queryAware?: boolean }) {
  const pathname = usePathname();
  return <nav className="public-nav" aria-label="Hovedmeny">{queryAware ? <QueryLinks /> : <Links pathname={pathname} activities={false} />}</nav>;
}
function QueryLinks() {
  const pathname = usePathname();
  const search = useSearchParams();
  return <Links pathname={pathname} activities={search.get('type') === 'activities'} />;
}
function Links({ pathname, activities }: { pathname: string; activities: boolean }) {
  return <><Link href="/discover" aria-current={pathname === '/discover' && !activities ? 'page' : undefined}>Finn trening</Link><Link href="/discover?type=activities" aria-current={pathname === '/discover' && activities ? 'page' : undefined}>Kurs og aktiviteter</Link><Link href="/online-courses" aria-current={pathname.startsWith('/online-courses') ? 'page' : undefined}>Nettkurs</Link></>;
}

export function SiteNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const close = () => setOpen(false);
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) close(); };
    window.addEventListener('hundetimer:profile-menu-open', close);
    document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('hundetimer:profile-menu-open', close); document.removeEventListener('pointerdown', outside); };
  }, []);
  return <div ref={container} className="site-navigation" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); }
  }}>
    <button ref={toggle} className="mobile-menu-toggle" type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}>{open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}<span>{open ? 'Lukk' : 'Meny'}</span></button>
    <div id="site-menu" className={`site-menu${open ? ' is-open' : ''}`} onClick={event => { if ((event.target as HTMLElement).closest('a')) setOpen(false); }}>
      <Suspense fallback={<PublicLinks />}><PublicLinks queryAware /></Suspense>
    </div>
    <div className="account-navigation">{children}</div>
  </div>;
}
