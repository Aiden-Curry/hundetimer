'use client';

import Link from 'next/link';
import { HundetimerBrand } from '@/components/hundetimer-brand';
import type { ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldCheck,
  BadgeCheck,
  UsersRound,
  WalletCards,
  Banknote,
  Mail,
  UserRoundMinus,
  ExternalLink,
} from 'lucide-react';

type Item = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  exact?: boolean;
};

const sections: { label?: string; items: Item[] }[] = [
  {
    items: [
      { href: '/admin', label: 'Oversikt', icon: LayoutDashboard, exact: true },
      { href: '/admin/moderation', label: 'Moderering', icon: ShieldCheck },
      { href: '/admin/trainers', label: 'Trenere', icon: BadgeCheck },
      { href: '/admin/users', label: 'Brukere', icon: UsersRound },
    ],
  },
  {
    label: 'Økonomi og drift',
    items: [
      { href: '/admin/payouts', label: 'Utbetalinger', icon: WalletCards },
      { href: '/admin/finance', label: 'Økonomi', icon: Banknote },
      { href: '/admin/newsletter', label: 'Nyhetsbrev', icon: Mail },
      { href: '/admin/privacy', label: 'Personvern', icon: UserRoundMinus },
    ],
  },
];

export function AdminDashboardSidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <HundetimerBrand compact inverse showTagline={false} className="dashboard-brand" />
      <div className="admin-sidebar-head">
        <div className="admin-sidebar-avatar">{displayName.trim().slice(0, 1).toUpperCase()}</div>
        <div className="admin-sidebar-identity">
          <span>Administrasjon</span>
          <strong>{displayName || 'Administrator'}</strong>
          <small>Plattformkontroll</small>
        </div>
      </div>

      <nav className="admin-sidebar-nav" aria-label="Admin dashboard">
        {sections.map((section, index) => (
          <div className="admin-sidebar-section" key={section.label || `main-${index}`}>
            {section.label ? <span className="admin-sidebar-label">{section.label}</span> : null}
            {section.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link className={active ? 'admin-sidebar-link active' : 'admin-sidebar-link'} href={item.href} key={item.href}>
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <Link className="admin-public-link" href="/discover">
        <ExternalLink size={16} strokeWidth={2} />
        Se markedsplassen
      </Link>
    </aside>
  );
}
