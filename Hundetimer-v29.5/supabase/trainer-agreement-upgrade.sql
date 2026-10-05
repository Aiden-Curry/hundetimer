-- Hundetimer trainer agreement acceptance and audit trail
-- Run after trainer-verification-upgrade.sql.

create table if not exists public.trainer_agreement_versions (
  version text primary key,
  title text not null,
  effective_at date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

-- Keep exactly one current version for normal application flow.
update public.trainer_agreement_versions set is_current = false where is_current = true and version <> '1.0';
insert into public.trainer_agreement_versions (version, title, effective_at, is_current)
values ('1.0', 'Hundetimer treneravtale', '2026-10-01', true)
on conflict (version) do update set title = excluded.title, effective_at = excluded.effective_at, is_current = excluded.is_current;

create unique index if not exists trainer_agreement_one_current_idx
  on public.trainer_agreement_versions ((is_current)) where is_current = true;

create table if not exists public.trainer_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id),
  agreement_version text not null references public.trainer_agreement_versions(version),
  agreement_snapshot text not null,
  content_sha256 text not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  acceptance_method text not null default 'clickwrap' check (acceptance_method in ('clickwrap','admin_recorded')),
  created_at timestamptz not null default now(),
  unique (trainer_id, agreement_version)
);

create index if not exists trainer_agreement_acceptances_trainer_idx
  on public.trainer_agreement_acceptances(trainer_id, accepted_at desc);

alter table public.trainer_agreement_versions enable row level security;
alter table public.trainer_agreement_acceptances enable row level security;

drop policy if exists "trainer_agreement_versions_public_read" on public.trainer_agreement_versions;
create policy "trainer_agreement_versions_public_read" on public.trainer_agreement_versions
  for select to public using (true);

drop policy if exists "trainer_agreement_acceptances_own_read" on public.trainer_agreement_acceptances;
create policy "trainer_agreement_acceptances_own_read" on public.trainer_agreement_acceptances
  for select to authenticated using (trainer_id = auth.uid() or public.is_current_user_admin());

alter table public.trainer_verification_submissions
  add column if not exists agreement_acceptance_id uuid references public.trainer_agreement_acceptances(id);

create index if not exists trainer_verification_agreement_idx
  on public.trainer_verification_submissions(agreement_acceptance_id);

-- Enforce the current agreement at the database boundary and attach the exact
-- acceptance used for each verification submission.
create or replace function public.require_current_trainer_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text;
  v_acceptance_id uuid;
begin
  select version into v_version
  from public.trainer_agreement_versions
  where is_current = true
  limit 1;

  if v_version is null then
    raise exception 'Ingen aktiv treneravtale er konfigurert.';
  end if;

  select id into v_acceptance_id
  from public.trainer_agreement_acceptances
  where trainer_id = new.trainer_id
    and agreement_version = v_version
  order by accepted_at desc
  limit 1;

  if v_acceptance_id is null then
    raise exception 'Du må lese og godta gjeldende treneravtale før du kan sende inn verifisering.';
  end if;

  new.agreement_acceptance_id := v_acceptance_id;
  return new;
end;
$$;

drop trigger if exists require_current_trainer_agreement_trigger on public.trainer_verification_submissions;
create trigger require_current_trainer_agreement_trigger
  before insert on public.trainer_verification_submissions
  for each row execute function public.require_current_trainer_agreement();
