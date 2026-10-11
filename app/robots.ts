import type { MetadataRoute } from 'next';
import { PRIVATE_PATHS, SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS.flatMap(path => [path + '$', path + '/', path + '?']) },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
