import '@/app/auth/auth-pages.css';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export const metadata = { title: 'Glemt passord', robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="account-access-page"><ForgotPasswordForm invalidLink={error === 'recovery'} /></main>;
}
