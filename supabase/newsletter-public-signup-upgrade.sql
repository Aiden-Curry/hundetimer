-- Hundetimer v29.9: public platform newsletter signup + registration opt-in
-- Run after trainer-agreement-signature-flow-upgrade.sql.

alter table public.newsletter_subscriptions
  add column if not exists consent_version text,
  add column if not exists consent_text text;

alter table public.newsletter_subscriptions
  drop constraint if exists newsletter_subscriptions_source_check;
alter table public.newsletter_subscriptions
  add constraint newsletter_subscriptions_source_check
  check (source in ('account','marketplace','external','import','website'));

-- Keep one platform subscription per email address. Prefer active and account-linked
-- rows if older development data contains duplicates.
with ranked as (
  select id,
         row_number() over (
           partition by lower(email)
           order by (unsubscribed_at is null) desc, (user_id is not null) desc, subscribed_at desc, created_at desc
         ) as rn
  from public.newsletter_subscriptions
  where scope = 'platform'
)
delete from public.newsletter_subscriptions n
using ranked r
where n.id = r.id and r.rn > 1;

create unique index if not exists newsletter_platform_email_unique
  on public.newsletter_subscriptions (lower(email))
  where scope = 'platform';

-- Registration metadata can contain an optional newsletter choice. If the email
-- had already subscribed on the public website, keep that earlier consent active
-- and link it to the newly-created account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text;
  v_registration_opt_in boolean;
  v_existing_active boolean;
  v_marketing_email boolean;
  v_existing_subscription_id uuid;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'bruker'), '@', 1));
  v_registration_opt_in := lower(coalesce(new.raw_user_meta_data ->> 'newsletter_opt_in', 'false')) in ('true','1','yes','on');

  insert into public.profiles (id, role, display_name)
  values (new.id, 'owner', v_name)
  on conflict (id) do nothing;

  select exists(
    select 1
    from public.newsletter_subscriptions
    where scope = 'platform'
      and new.email is not null
      and lower(email) = lower(new.email)
      and unsubscribed_at is null
  ) into v_existing_active;

  v_marketing_email := v_registration_opt_in or v_existing_active;

  insert into public.privacy_preferences (user_id, marketing_email, product_updates, analytics_consent, updated_at)
  values (new.id, v_marketing_email, false, false, now())
  on conflict (user_id) do update
    set marketing_email = excluded.marketing_email,
        updated_at = excluded.updated_at;

  if new.email is not null then
    select id into v_existing_subscription_id
    from public.newsletter_subscriptions
    where scope = 'platform' and lower(email) = lower(new.email)
    limit 1;

    if v_existing_subscription_id is not null and v_existing_active then
      update public.newsletter_subscriptions
      set user_id = new.id,
          name = coalesce(name, v_name),
          updated_at = now()
      where id = v_existing_subscription_id;
    elsif v_registration_opt_in then
      if v_existing_subscription_id is not null then
        update public.newsletter_subscriptions
        set user_id = new.id,
            name = v_name,
            source = 'account',
            subscribed_at = now(),
            unsubscribed_at = null,
            consent_version = 'registration-newsletter-2026-10',
            consent_text = 'Jeg ønsker nyheter om hundetrenere, kurs, aktiviteter og tilbud fra Hundetimer på e-post. Jeg kan melde meg av når som helst.',
            updated_at = now()
        where id = v_existing_subscription_id;
      else
        insert into public.newsletter_subscriptions (
          scope, trainer_id, user_id, email, name, source, subscribed_at,
          consent_version, consent_text, updated_at
        ) values (
          'platform', null, new.id, lower(new.email), v_name, 'account', now(),
          'registration-newsletter-2026-10',
          'Jeg ønsker nyheter om hundetrenere, kurs, aktiviteter og tilbud fra Hundetimer på e-post. Jeg kan melde meg av når som helst.',
          now()
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
