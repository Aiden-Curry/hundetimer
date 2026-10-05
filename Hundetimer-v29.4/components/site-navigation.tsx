'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

export function SiteNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);

  return <div className="site-navigation" onKeyDown={event => {
    if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); }
  }}>
    <button ref={toggle} className="mobile-menu-toggle" type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}<span>{open ? 'Lukk' : 'Meny'}</span></button>
    <div id="site-menu" className={`site-menu${open ? ' is-open' : ''}`} onClick={event => { if ((event.target as HTMLElement).closest('a')) setOpen(false); }}>
      <nav className="public-nav" aria-label="Hovedmeny"><Link href="/discover" aria-current={pathname === '/discover' ? 'page' : undefined}>Finn trening</Link><Link href="/discover?type=activities">Kurs og aktiviteter</Link><Link href="/online-courses" aria-current={pathname.startsWith('/online-courses') ? 'page' : undefined}>Nettkurs</Link></nav>
      <div className="account-navigation">{children}</div>
    </div>
  </div>;
}
