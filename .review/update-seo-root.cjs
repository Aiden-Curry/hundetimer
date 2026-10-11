const fs=require('fs');const f='app/layout.tsx';let s=fs.readFileSync(f,'utf8');const start=s.indexOf('export const metadata = {');const end=s.indexOf('\nexport default function',start);if(start<0||end<0)throw Error('metadata not found');const metadata=`export async function generateMetadata(): Promise<Metadata> {
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
`;
s="import type { Metadata } from 'next';\nimport { headers } from 'next/headers';\nimport { SITE_URL, SITE_TITLE, SITE_DESCRIPTION, isPrivatePath } from '@/lib/seo';\n"+s.slice(0,start)+metadata+s.slice(end);fs.writeFileSync(f,s);
