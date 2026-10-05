-- V28 newsletter system
create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform','trainer')),
  trainer_id uuid references public.trainer_profiles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  trainer_client_id uuid references public.trainer_clients(id) on delete cascade,
  email text not null,
  name text,
  source text not null default 'account' check (source in ('account','marketplace','external','import')),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_scope_trainer check ((scope='platform' and trainer_id is null) or (scope='trainer' and trainer_id is not null))
);
create unique index if not exists newsletter_platform_user_unique on public.newsletter_subscriptions(user_id) where scope='platform' and user_id is not null;
create unique index if not exists newsletter_trainer_user_unique on public.newsletter_subscriptions(trainer_id,user_id) where scope='trainer' and user_id is not null;
create unique index if not exists newsletter_trainer_client_unique on public.newsletter_subscriptions(trainer_id,trainer_client_id) where scope='trainer' and trainer_client_id is not null;
create index if not exists newsletter_subscriptions_scope_idx on public.newsletter_subscriptions(scope, trainer_id, unsubscribed_at);

create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform','trainer')),
  trainer_id uuid references public.trainer_profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  subject text not null,
  preheader text,
  body text not null,
  cta_label text,
  cta_url text,
  audience text not null default 'all' check (audience in ('all','marketplace','external')),
  status text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_campaign_scope_trainer check ((scope='platform' and trainer_id is null) or (scope='trainer' and trainer_id is not null))
);
create index if not exists newsletter_campaigns_scope_idx on public.newsletter_campaigns(scope, trainer_id, created_at desc);

create table if not exists public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  subscription_id uuid references public.newsletter_subscriptions(id) on delete set null,
  email text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  provider_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id,email)
);
create index if not exists newsletter_deliveries_campaign_idx on public.newsletter_deliveries(campaign_id,status);

alter table public.trainer_clients add column if not exists newsletter_opt_in boolean not null default false;

alter table public.newsletter_subscriptions enable row level security;
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_deliveries enable row level security;

revoke all on public.newsletter_subscriptions from anon, authenticated;
revoke all on public.newsletter_campaigns from anon, authenticated;
revoke all on public.newsletter_deliveries from anon, authenticated;

-- Users can only read their own subscriptions. Mutations happen through server actions with the service role.
grant select on public.newsletter_subscriptions to authenticated;
drop policy if exists newsletter_subscriptions_read_own on public.newsletter_subscriptions;
create policy newsletter_subscriptions_read_own on public.newsletter_subscriptions for select to authenticated
using (user_id=auth.uid() or trainer_id=auth.uid());

-- Trainers can read their own campaigns/deliveries. Admin reads through service role.
grant select on public.newsletter_campaigns to authenticated;
drop policy if exists newsletter_campaigns_read_trainer on public.newsletter_campaigns;
create policy newsletter_campaigns_read_trainer on public.newsletter_campaigns for select to authenticated
using (trainer_id=auth.uid());

grant select on public.newsletter_deliveries to authenticated;
drop policy if exists newsletter_deliveries_read_trainer on public.newsletter_deliveries;
create policy newsletter_deliveries_read_trainer on public.newsletter_deliveries for select to authenticated
using (exists(select 1 from public.newsletter_campaigns c where c.id=campaign_id and c.trainer_id=auth.uid()));

-- Backfill platform subscriptions for users who already opted into marketing email.
insert into public.newsletter_subscriptions(scope,user_id,email,name,source,subscribed_at)
select 'platform', p.id, u.email, p.display_name, 'account', now()
from public.profiles p
join auth.users u on u.id=p.id
join public.privacy_preferences pp on pp.user_id=p.id and pp.marketing_email=true
where u.email is not null
on conflict do nothing;
