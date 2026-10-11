import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { SITE_URL } from '@/lib/seo';

// Read public listings at request time, never with a signed-in user's access.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // /browse and /activities redirect to /discover; include the canonical destination.
  const pages = ['/', '/discover', '/online-courses', '/bli-trener', '/kontakt', '/vilkar', '/personvern'];
  const entries: MetadataRoute.Sitemap = pages.map(path => ({ url: `${SITE_URL}${path === '/' ? '' : path}` }));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return entries;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  async function rows(table: string, columns: string, flag: string) {
    const result: Record<string, string>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from(table).select(columns).eq(flag, true).order('id').range(offset, offset + 499).abortSignal(AbortSignal.timeout(10000));
      if (error) throw new Error(`Could not load public sitemap listings: ${table}`);
      const batch = (data || []) as unknown as Record<string, string>[];
      result.push(...batch);
      if (batch.length < 500) return result;
    }
  }
  const listings = await Promise.allSettled([
    rows('trainer_profiles', 'id,slug', 'verified'),
    rows('group_offerings', 'id,trainer_id', 'active'),
    rows('online_courses', 'id,slug,trainer_id', 'published'),
  ]);
  // A database outage must not hide the static public pages from crawlers.
  const [trainers, activities, courses] = listings.map(result => {
    if (result.status === 'fulfilled') return result.value;
    console.warn('[sitemap] Public listings unavailable; using the available public URLs.');
    return [] as Record<string, string>[];
  });
  const trainerIds = new Set(trainers.map(trainer => trainer.id));
  for (const trainer of trainers) if (trainer.slug) entries.push({ url: `${SITE_URL}/trainers/${encodeURIComponent(trainer.slug)}` });
  for (const activity of activities) if (trainerIds.has(activity.trainer_id)) entries.push({ url: `${SITE_URL}/activities/${encodeURIComponent(activity.id)}` });
  for (const course of courses) if (course.slug && trainerIds.has(course.trainer_id)) entries.push({ url: `${SITE_URL}/online-courses/${encodeURIComponent(course.slug)}` });
  return entries;
}
