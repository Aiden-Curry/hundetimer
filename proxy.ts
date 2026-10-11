import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { isPrivatePath } from '@/lib/seo';

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  if (isPrivatePath(request.nextUrl.pathname)) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
