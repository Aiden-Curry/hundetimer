-- MVP v27: CRM + private lesson journal.
-- Run after v26 trainer-planner-upgrade.sql.

create table if not exists public.trainer_lesson_journals (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  external_appointment_id uuid references public.external_appointments(id) on delete set null,
  platform_customer_id uuid references public.profiles(id) on delete set null,
  platform_dog_id uuid references public.dogs(id) on delete set null,
  trainer_client_id uuid references public.trainer_clients(id) on delete set null,
  trainer_client_dog_id uuid references public.trainer_client_dogs(id) on delete set null,
  client_name_snapshot text not null,
  dog_name_snapshot text not null,
  service_title_snapshot text,
  occurred_at timestamptz not null,
  goals text,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (booking_id is not null or external_appointment_id is not null)
);
create unique index if not exists trainer_lesson_journal_booking_uidx
  on public.trainer_lesson_journals(booking_id) where booking_id is not null;
create unique index if not exists trainer_lesson_journal_external_uidx
  on public.trainer_lesson_journals(external_appointment_id) where external_appointment_id is not null;
create index if not exists trainer_lesson_journal_trainer_time_idx
  on public.trainer_lesson_journals(trainer_id, occurred_at desc);
create index if not exists trainer_lesson_journal_platform_client_idx
  on public.trainer_lesson_journals(trainer_id, platform_customer_id, occurred_at desc);
create index if not exists trainer_lesson_journal_external_client_idx
  on public.trainer_lesson_journals(trainer_id, trainer_client_id, occurred_at desc);

create table if not exists public.lesson_shared_notes (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null unique references public.trainer_lesson_journals(id) on delete cascade,
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  shared_summary text,
  homework text,
  next_steps text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lesson_shared_notes_customer_idx
  on public.lesson_shared_notes(customer_id, published_at desc);
create index if not exists lesson_shared_notes_trainer_idx
  on public.lesson_shared_notes(trainer_id, updated_at desc);

alter table public.trainer_lesson_journals enable row level security;
alter table public.lesson_shared_notes enable row level security;

-- Private journal content is visible only to the trainer and admins.
drop policy if exists trainer_lesson_journals_read on public.trainer_lesson_journals;
create policy trainer_lesson_journals_read on public.trainer_lesson_journals
  for select to authenticated
  using (trainer_id = auth.uid() or public.is_current_user_admin());

-- Shared notes are readable by the trainer/admin and, only after publishing,
-- by the customer attached to the marketplace booking.
drop policy if exists lesson_shared_notes_read on public.lesson_shared_notes;
create policy lesson_shared_notes_read on public.lesson_shared_notes
  for select to authenticated
  using (
    trainer_id = auth.uid()
    or public.is_current_user_admin()
    or (customer_id = auth.uid() and published_at is not null)
  );

-- All writes are done by guarded server actions through the service role.
revoke insert, update, delete on public.trainer_lesson_journals from anon, authenticated;
revoke insert, update, delete on public.lesson_shared_notes from anon, authenticated;

grant select on public.trainer_lesson_journals to authenticated;
grant select on public.lesson_shared_notes to authenticated;
