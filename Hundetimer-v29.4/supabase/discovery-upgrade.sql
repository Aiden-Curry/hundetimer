-- MVP v13: search, discovery and location filtering

alter table public.trainer_profiles add column if not exists latitude numeric;
alter table public.trainer_profiles add column if not exists longitude numeric;

alter table public.services add column if not exists delivery_mode text not null default 'in_person';

do $$ begin
  alter table public.services add constraint services_delivery_mode_check check (delivery_mode in ('in_person','online','both'));
exception when duplicate_object then null;
end $$;

alter table public.group_offerings add column if not exists tags text[] not null default '{}';
alter table public.group_offerings add column if not exists latitude numeric;
alter table public.group_offerings add column if not exists longitude numeric;

create index if not exists trainer_profiles_city_lower_idx on public.trainer_profiles (lower(city));
create index if not exists group_offerings_city_lower_idx on public.group_offerings (lower(city));
create index if not exists services_delivery_mode_idx on public.services (delivery_mode) where active = true;
create index if not exists group_offerings_tags_gin_idx on public.group_offerings using gin(tags);
