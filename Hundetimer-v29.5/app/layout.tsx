import './globals.css';
import './refinements.css';
import Link from 'next/link';
import { AuthNav } from '@/components/auth-nav';
import { HundetimerBrand } from '@/components/hundetimer-brand';
import { SiteNavigation } from '@/components/site-navigation';

export const metadata = {
  metadataBase: new URL('https://hundetimer.no'),
  title: {
    default: 'Hundetimer | Hundetrening samlet på ett sted',
    template: '%s | Hundetimer',
  },
  description: 'Finn hundetrenere, privattimer, kurs, arrangementer og nettkurs på Hundetimer.',
  applicationName: 'Hundetimer',
  openGraph: {
    title: 'Hundetimer | Hundetrening samlet på ett sted',
    description: 'Finn hundetrenere, privattimer, kurs, arrangementer og nettkurs.',
    url: 'https://hundetimer.no',
    siteName: 'Hundetimer',
    locale: 'nb_NO',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body>
        <a className="skip-link" href="#main-content">Hopp til innhold</a>
        <header className="site-header">
          <div className="nav-shell">
            <HundetimerBrand />
            <SiteNavigation><AuthNav /></SiteNavigation>
          </div>
        </header>
        <div id="main-content" tabIndex={-1}>{children}</div>
        <footer className="site-footer">
          <div className="footer-shell">
            <div className="footer-brand">
              <HundetimerBrand inverse />
              <p>Finn riktig hjelp, bestill trening og hold hele hundens treningsreise samlet.</p>
            </div>
            <div className="footer-links">
              <div><strong>Utforsk</strong><Link href="/discover">Finn hundetrener</Link><Link href="/discover?type=activities">Kurs og arrangementer</Link><Link href="/online-courses">Nettkurs</Link></div>
              <div><strong>For hundetrenere</strong><Link href="/bli-trener">Bli trener</Link><Link href="/vilkar/treneravtale">Treneravtale</Link></div>
              <div><strong>Konto</strong><Link href="/account/privacy">Personvern og konto</Link><Link href="/notifications">Varsler</Link><Link href="/messages">Meldinger</Link></div>
            </div>
          </div>
          <div className="footer-bottom"><span>Hundetimer.no · Hundetrening samlet på ett sted</span><span>© {new Date().getFullYear()} Hundetimer</span></div>
        </footer>
      </body>
    </html>
  );
}
