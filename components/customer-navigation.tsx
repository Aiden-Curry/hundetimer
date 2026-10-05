import Link from 'next/link';
import { Bell, BookOpen, Dog, Heart, LayoutDashboard, MessageCircle, Settings2 } from 'lucide-react';

const items = [
  { href: '/account', label: 'Min side', icon: LayoutDashboard },
  { href: '/account/dogs', label: 'Mine hunder', icon: Dog },
  { href: '/account#nettkurs', label: 'Mine kurs', icon: BookOpen },
  { href: '/saved', label: 'Lagret', icon: Heart },
  { href: '/messages', label: 'Meldinger', icon: MessageCircle },
  { href: '/notifications', label: 'Varsler', icon: Bell },
  { href: '/account/privacy', label: 'Personvern og konto', icon: Settings2 },
];

export function CustomerNavigation({ current }: { current: string }) {
  return <nav className="customer-navigation" aria-label="Min konto">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>)}</nav>;
}
