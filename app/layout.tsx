import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION, isPrivatePath } from '@/lib/seo';
import './globals.css';
import './refinements.css';
import './ui.css';
import Link from 'next/link';
import { AuthNav } from '@/components/auth-nav';
import { HundetimerBrand } from '@/components/hundetimer-brand';
import { SiteNavigation } from '@/components/site-navigation';
import { PlatformNewsletterSignup } from '@/components/platform-newsletter-signup';
import { CookieConsent, CookieSettingsButton } from '@/components/cookie-consent';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const rawPath = requestHeaders.get('x-hundetimer-pathname') || '/';
  const path = rawPath.startsWith('/') && !rawPath.startsWith('//') ? rawPath : '/';
  const privatePage = isPrivatePath(path);
  const canonical = new URL(path, SITE_URL).href;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: SITE_TITLE, template: '%s | Hundetimer' },
    description: SITE_DESCRIPTION,
    applicationName: 'Hundetimer',
    alternates: privatePage ? undefined : { canonical },
    robots: privatePage ? { index: false, follow: false } : undefined,
    openGraph: {
      title: SITE_TITLE, description: SITE_DESCRIPTION, url: canonical,
      siteName: 'Hundetimer', locale: 'nb_NO', type: 'website',
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Hundetimer – finn hundetrener, kurs og hundetrening' }],
    },
    twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: ['/opengraph-image'] },
  };
}

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
              <div className="footer-newsletter"><strong>Få Hundetimer-nyheter</strong><span>Nye kurs, aktiviteter og hundetrenere på e-post.</span><PlatformNewsletterSignup compact /></div>
            </div>
            <nav className="footer-links" aria-label="Lenker i bunntekst">
              <div><strong>Utforsk</strong><Link href="/discover">Finn hundetrener</Link><Link href="/discover?type=activities">Kurs og arrangementer</Link><Link href="/online-courses">Nettkurs</Link></div>
              <div><strong>For hundetrenere</strong><Link href="/bli-trener">Bli trener</Link><Link href="/kontakt">Kontakt</Link></div>
              <div><strong>Konto</strong><Link href="/personvern">Personvern</Link><Link href="/vilkar">Brukervilkår</Link><Link href="/account/privacy">Personvern og konto</Link><Link href="/notifications">Varsler</Link><Link href="/messages">Meldinger</Link><CookieSettingsButton /></div>
            </nav>
          </div>
          <div className="footer-bottom"><span>Hundetimer.no · Hundetrening samlet på ett sted</span><span>© {new Date().getFullYear()} Hundetimer</span></div>
        </footer>
        <CookieConsent />
      </body>
    </html>
  );
}
