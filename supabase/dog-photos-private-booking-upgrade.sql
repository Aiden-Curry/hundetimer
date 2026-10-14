-- Apply after owner-dogs-upgrade.sql and notifications-upgrade.sql.
BEGIN;

alter table public.dogs add column if not exists photo_path text;
alter table public.dogs drop constraint if exists dogs_photo_owner_path_check;
alter table public.dogs add constraint dogs_photo_owner_path_check
  check (photo_path is null or split_part(photo_path, '/', 1) = owner_id::text);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dog-photos', 'dog-photos', false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dog_photos_read on storage.objects;
create policy dog_photos_read on storage.objects for select to authenticated
using (bucket_id = 'dog-photos' and (
  (storage.foldername(name))[1] = auth.uid()::text
  or exists (select 1 from public.dogs d where d.photo_path = storage.objects.name)
));
-- dogs SELECT RLS above restricts related trainers to their booking relationship.
drop policy if exists dog_photos_insert on storage.objects;
create policy dog_photos_insert on storage.objects for insert to authenticated
with check (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists dog_photos_update on storage.objects;
create policy dog_photos_update on storage.objects for update to authenticated
using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists dog_photos_delete on storage.objects;
create policy dog_photos_delete on storage.objects for delete to authenticated
using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Persistent email delivery receipts extend provider deduplication beyond its 24h window.
create table if not exists public.private_booking_email_deliveries (
  event_key text primary key,
  first_attempt_at timestamptz not null default now(),
  locked_until timestamptz not null default now() + interval '5 minutes',
  sent_at timestamptz
);
alter table public.private_booking_email_deliveries enable row level security;
revoke all on public.private_booking_email_deliveries from anon, authenticated;
grant all on public.private_booking_email_deliveries to service_role;

create or replace function public.claim_private_booking_email(p_event_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.private_booking_email_deliveries (event_key) values (p_event_key)
  on conflict (event_key) do update set locked_until = now() + interval '5 minutes'
  where private_booking_email_deliveries.sent_at is null
    and private_booking_email_deliveries.locked_until < now();
  return found;
end;
$$;
revoke all on function public.claim_private_booking_email(text) from public, anon, authenticated;
grant execute on function public.claim_private_booking_email(text) to service_role;

-- Do not let a delayed successful-payment webhook revive a cancelled booking.
create or replace function public.system_confirm_booking(
  p_booking_id uuid, p_event_type text default 'booking_confirmed_system'
) returns void language plpgsql security definer set search_path = '' as $$
declare v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Bestillingen finnes ikke.'; end if;
  if v_booking.status = 'confirmed' then return; end if;
  if v_booking.status <> 'pending' or v_booking.cancelled_by is not null then
    raise exception 'Bestillingen kan ikke bekreftes.';
  end if;
  if v_booking.payment_status <> 'captured' then raise exception 'Betalingen er ikke trukket.'; end if;
  update public.availability_slots set status = 'booked'
    where id = v_booking.slot_id and status in ('held','booked');
  update public.bookings set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()),
    trainer_response_due_at = null where id = p_booking_id;
  insert into public.booking_events (booking_id, event_type) values (p_booking_id, p_event_type);
end;
$$;
revoke execute on function public.system_confirm_booking(uuid, text) from public, anon, authenticated;
grant execute on function public.system_confirm_booking(uuid, text) to service_role;

COMMIT;
