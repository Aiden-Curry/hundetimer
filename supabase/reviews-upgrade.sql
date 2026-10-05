-- MVP v11: verified reviews and trainer replies

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  comment text,
  trainer_reply text,
  trainer_replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_trainer_created_idx on public.reviews(trainer_id, created_at desc);
create index if not exists reviews_customer_idx on public.reviews(customer_id, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read"
on public.reviews for select
to anon, authenticated
using (true);

-- Reviews are written only by trusted server actions after the booking is verified.
-- Do not add public insert/update/delete policies here.

grant select on public.reviews to anon, authenticated;
revoke insert, update, delete on public.reviews from anon, authenticated;
