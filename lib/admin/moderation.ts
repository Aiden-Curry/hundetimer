import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/moderation');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') redirect('/');
  return { user, admin: createAdminClient() };
}

export async function writeAudit(admin: ReturnType<typeof createAdminClient>, input: {
  adminId: string;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  reportId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from('admin_audit_log').insert({
    admin_id: input.adminId,
    action_type: input.actionType,
    target_type: input.targetType,
    target_id: input.targetId || null,
    report_id: input.reportId || null,
    note: input.note?.slice(0, 3000) || null,
    metadata: input.metadata || {},
  });
  if (error) throw error;
}
