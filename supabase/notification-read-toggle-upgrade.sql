-- Hundetimer v29.11: allow users to explicitly mark their own notifications read or unread.
-- Run after notifications-upgrade.sql.

create or replace function public.set_notification_read_state(
  p_notification_id uuid,
  p_read boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Du må være logget inn.';
  end if;

  update public.notifications
  set read_at = case when p_read then coalesce(read_at, now()) else null end
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

revoke execute on function public.set_notification_read_state(uuid, boolean) from public, anon;
grant execute on function public.set_notification_read_state(uuid, boolean) to authenticated;
