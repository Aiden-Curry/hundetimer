-- MVP v16: booking-based messaging
-- Run once after trainer-verification-upgrade.sql.

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint booking_messages_body_length check (char_length(trim(body)) between 1 and 2000)
);

create index if not exists booking_messages_booking_created_idx
  on public.booking_messages(booking_id, created_at);
create index if not exists booking_messages_unread_idx
  on public.booking_messages(booking_id, read_at)
  where read_at is null;

alter table public.booking_messages enable row level security;

drop policy if exists "booking_messages_select_participants" on public.booking_messages;
create policy "booking_messages_select_participants"
  on public.booking_messages for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_messages.booking_id
        and auth.uid() in (b.customer_id, b.trainer_id)
    )
  );

-- No generic INSERT/UPDATE/DELETE permission is granted. These narrow functions
-- are the only write paths for normal users, so message history cannot be edited.
revoke insert, update, delete on table public.booking_messages from authenticated;
grant select on table public.booking_messages to authenticated;

create or replace function public.send_booking_message(
  p_booking_id uuid,
  p_body text
)
returns public.booking_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_message public.booking_messages;
begin
  if v_user_id is null then
    raise exception 'Du må være logget inn.';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'Meldingen må være mellom 1 og 2000 tegn.';
  end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and v_user_id in (b.customer_id, b.trainer_id)
  ) then
    raise exception 'Du har ikke tilgang til denne samtalen.';
  end if;

  insert into public.booking_messages (booking_id, sender_id, body)
  values (p_booking_id, v_user_id, v_body)
  returning * into v_message;

  return v_message;
end;
$$;

grant execute on function public.send_booking_message(uuid, text) to authenticated;

create or replace function public.mark_booking_messages_read(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then return 0; end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and v_user_id in (b.customer_id, b.trainer_id)
  ) then
    raise exception 'Du har ikke tilgang til denne samtalen.';
  end if;

  update public.booking_messages
  set read_at = now()
  where booking_id = p_booking_id
    and sender_id <> v_user_id
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_booking_messages_read(uuid) to authenticated;

-- Realtime lets an open conversation receive new messages without refreshing.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'booking_messages'
  ) then
    alter publication supabase_realtime add table public.booking_messages;
  end if;
end $$;
