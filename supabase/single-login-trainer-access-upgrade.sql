-- Hundetimer v29.5: one login, trainer access only after approval
-- Run after trainer-agreement-upgrade.sql.

-- New registrations are always normal Hundetimer accounts. Trainer access is a
-- capability granted later by approval, not a registration choice.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'owner',
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'bruker'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Users may edit their own profile, but they may never grant themselves trainer
-- or admin access by changing profiles.role through the client.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = old.id and not public.is_current_user_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_trigger on public.profiles;
create trigger protect_profile_role_trigger
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Verification status is the source of truth for trainer access. Approved
-- trainers gain the trainer capability. Pending, rejected and not submitted
-- applicants remain normal customer accounts. Suspended existing trainers keep
-- dashboard access so they can manage existing obligations, while their public
-- marketplace profile remains hidden by the existing verification policies.
create or replace function public.sync_trainer_access_from_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verification_status = 'approved' then
    update public.profiles
    set role = 'trainer', updated_at = now()
    where id = new.id and role <> 'admin';
  elsif new.verification_status in ('not_submitted', 'pending', 'rejected') then
    update public.profiles
    set role = 'owner', updated_at = now()
    where id = new.id and role = 'trainer';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_trainer_access_from_verification_trigger on public.trainer_profiles;
create trigger sync_trainer_access_from_verification_trigger
  after insert or update of verification_status on public.trainer_profiles
  for each row execute function public.sync_trainer_access_from_verification();

-- Bring older pre-v29.5 pending/rejected trainer accounts into the new model.
update public.profiles p
set role = 'owner', updated_at = now()
from public.trainer_profiles t
where p.id = t.id
  and p.role = 'trainer'
  and t.verification_status in ('not_submitted', 'pending', 'rejected');

update public.profiles p
set role = 'trainer', updated_at = now()
from public.trainer_profiles t
where p.id = t.id
  and p.role = 'owner'
  and t.verification_status = 'approved';

-- Approved trainers are still buyers. Saved items therefore belong to any
-- non-admin signed-in account, not only accounts whose role is exactly owner.
drop policy if exists "Owners can save items" on public.saved_items;
create policy "Signed in customers can save items"
on public.saved_items for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role <> 'admin'
  )
);
