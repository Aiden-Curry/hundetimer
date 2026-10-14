import '@/app/auth/auth-pages.css';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from '@/components/reset-password-form';

export const metadata = { title: 'Lag et nytt passord', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (params.error) redirect('/forgot-password?error=recovery');
  let authenticated = false;
  try {
    const { data: { user }, error } = await (await createClient()).auth.getUser();
    authenticated = Boolean(user && !error);
  } catch { /* An unavailable or expired session cannot change a password. */ }
  if (!authenticated) redirect('/forgot-password?error=recovery');
  return <main className="account-access-page"><ResetPasswordForm /></main>;
}
