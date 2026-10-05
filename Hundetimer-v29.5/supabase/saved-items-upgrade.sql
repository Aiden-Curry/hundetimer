-- MVP v18: saved trainers, services, activities and online courses

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('trainer','service','activity','online_course')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, item_type, item_id)
);

create index if not exists saved_items_owner_created_idx
  on public.saved_items(owner_id, created_at desc);

alter table public.saved_items enable row level security;

drop policy if exists "Owners can read their saved items" on public.saved_items;
create policy "Owners can read their saved items"
on public.saved_items for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Owners can save items" on public.saved_items;
create policy "Owners can save items"
on public.saved_items for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'owner'
  )
);

drop policy if exists "Owners can remove saved items" on public.saved_items;
create policy "Owners can remove saved items"
on public.saved_items for delete
to authenticated
using (owner_id = auth.uid());

-- No UPDATE policy by design. Saved rows are immutable; toggle means insert/delete.
