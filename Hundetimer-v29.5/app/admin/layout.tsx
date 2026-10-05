import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminDashboardSidebar } from '@/components/admin-dashboard-sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') redirect('/');

  return (
    <div className="admin-app-shell">
      <AdminDashboardSidebar displayName={profile.display_name || 'Administrator'} />
      <div className="admin-app-content">{children}</div>
    </div>
  );
}
