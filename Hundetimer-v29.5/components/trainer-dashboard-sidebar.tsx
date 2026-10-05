'use client';

import Link from 'next/link';
import { HundetimerBrand } from '@/components/hundetimer-brand';
import type { ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  UsersRound,
  BriefcaseBusiness,
  GraduationCap,
  MonitorPlay,
  Tag,
  MessageSquare,
  Mail,
  Star,
  WalletCards,
  BadgeCheck,
  UserRoundCog,
  Clock3,
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
      { href: '/trainer-dashboard', label: 'Oversikt', icon: LayoutDashboard, exact: true },
      { href: '/trainer-dashboard/calendar', label: 'Kalender', icon: CalendarDays },
      { href: '/trainer-dashboard/clients', label: 'Kunder', icon: UsersRound },
    ],
  },
  {
    label: 'Tilbud',
    items: [
      { href: '/trainer-dashboard/services', label: 'Tjenester', icon: BriefcaseBusiness },
      { href: '/trainer-dashboard/groups', label: 'Kurs og arrangementer', icon: GraduationCap },
      { href: '/trainer-dashboard/online-courses', label: 'Nettkurs', icon: MonitorPlay },
      { href: '/trainer-dashboard/promotions', label: 'Rabattkoder', icon: Tag },
    ],
  },
  {
    label: 'Kunder og kommunikasjon',
    items: [
      { href: '/messages', label: 'Meldinger', icon: MessageSquare },
      { href: '/trainer-dashboard/reviews', label: 'Vurderinger', icon: Star },
      { href: '/trainer-dashboard/newsletter', label: 'Nyhetsbrev', icon: Mail },
    ],
  },
  {
    label: 'Drift',
    items: [
      { href: '/trainer-dashboard/availability', label: 'Tilgjengelighet', icon: Clock3 },
      { href: '/trainer-dashboard/finance', label: 'Økonomi', icon: WalletCards },
      { href: '/trainer-dashboard/profile', label: 'Profil', icon: UserRoundCog },
      { href: '/trainer-dashboard/verification', label: 'Verifisering', icon: BadgeCheck },
    ],
  },
];

export function TrainerDashboardSidebar({
  businessName,
  publicHref,
  verificationStatus,
}: {
  businessName: string;
  publicHref?: string | null;
  verificationStatus?: string | null;
}) {
  const pathname = usePathname();
  const approved = verificationStatus === 'approved';

  return (
    <aside className="trainer-sidebar">
      <HundetimerBrand compact showTagline={false} className="dashboard-brand" />
      <div className="trainer-sidebar-head">
        <div className="trainer-sidebar-avatar">{businessName.trim().slice(0, 1).toUpperCase()}</div>
        <div className="trainer-sidebar-identity">
          <span>Trenerområde</span>
          <strong>{businessName}</strong>
          <small className={approved ? 'trainer-sidebar-status is-approved' : 'trainer-sidebar-status'}>
            {approved ? 'Verifisert profil' : verificationStatus === 'pending' ? 'Til vurdering' : 'Ikke verifisert'}
          </small>
        </div>
      </div>

      <nav className="trainer-sidebar-nav" aria-label="Trenerdashboard">
        {sections.map((section, index) => (
          <div className="trainer-sidebar-section" key={section.label || `main-${index}`}>
            {section.label ? <span className="trainer-sidebar-label">{section.label}</span> : null}
            {section.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link className={active ? 'trainer-sidebar-link active' : 'trainer-sidebar-link'} href={item.href} key={item.href}>
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {publicHref ? (
        <Link className="trainer-public-link" href={publicHref}>
          <ExternalLink size={16} strokeWidth={2} />
          Se offentlig profil
        </Link>
      ) : null}
    </aside>
  );
}
