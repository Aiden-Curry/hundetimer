# Hundetimer v29.3 - Nordic Trust rebrand

V29.3 turns the previous working design into the Hundetimer brand using the selected Nordic Trust direction and the chosen dog/calendar logo.

## Brand

- Name: Hundetimer
- Domain: hundetimer.no
- Main tagline: Hundetrening samlet på ett sted
- Primary forest green: `#234033`
- Warm cream: `#F7F3EB`
- Muted gold: `#C9A86A`
- Sage: `#8FA892`
- Charcoal text: `#2D2D2D`
- Typeface stack prefers Manrope when available, with strong system fallbacks

## What changed

- Replaced HUNDEPLATTFORM / Dog Platform branding with Hundetimer
- Added the chosen Hundetimer dog/calendar mark to the site header
- Added a Hundetimer app icon/favicon
- Added Hundetimer branding to trainer and admin sidebars
- Reworked the public header and footer branding
- Updated homepage copy around Hundetimer.no
- Applied the Nordic Trust forest, cream, gold and sage palette throughout the public UI
- Recolored trainer dashboard surfaces and states to match the brand
- Recolored the admin dashboard while keeping it visually distinct from the trainer workspace
- Updated fallback email sender/brand names to Hundetimer
- Updated newsletter sender fallback to Hundetimer
- Updated calendar-created note text to Hundetimer
- Updated certificate PDF creator/producer metadata to Hundetimer
- Updated package name/version

## Brand assets

- `public/brand/hundetimer-mark.png`
  - Cropped web-ready version of the chosen dog/calendar mark
- `public/brand/hundetimer-logo-selected.png`
  - The selected full logo concept supplied by the user
- `app/icon.png`
  - App icon/favicon used by Next.js
- `components/hundetimer-brand.tsx`
  - Reusable Hundetimer wordmark/mark component used by the website and dashboards

## Database

No SQL migration is required for V29.3.

Use the same Supabase database as V29.2.

## Environment

Keep your existing `.env.local`.

For production later, the public site URL should become:

```env
NEXT_PUBLIC_SITE_URL=https://hundetimer.no
```

Recommended production brand values later:

```env
EMAIL_BRAND_NAME=Hundetimer
EMAIL_FROM=Hundetimer <booking@hundetimer.no>
NEWSLETTER_FROM=Hundetimer <nyheter@hundetimer.no>
```

Do not switch those sender addresses until the domain is configured and verified with the email provider.

## Run locally

```powershell
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Verification

- 160 TypeScript/TSX files passed a parser syntax check.
- `npm install` was attempted in the packaging environment but did not finish before the environment timeout, so a full Next.js production build was not completed here.
- No database schema changes were introduced in this version.

## Suggested visual checks

Check these pages first:

1. `/`
2. `/discover`
3. `/trainers/[trainer-slug]`
4. `/trainer-dashboard`
5. `/trainer-dashboard/calendar`
6. `/admin`
7. `/login`
8. `/account`

The next pass should be small visual refinements based on how V29.3 looks in your browser, rather than another large redesign.

## V29.4 - /bli-trener + treneravtale

This upgrade adds the public trainer information/pricing page, versioned trainer agreement acceptance, downloadable agreement PDFs and admin visibility.

Run this migration after the existing trainer verification migration:

```sql
supabase/trainer-agreement-upgrade.sql
```

Before inviting real trainers, set these public business identity values in `.env.local` / Vercel:

```env
NEXT_PUBLIC_HUNDETIMER_LEGAL_NAME=Your registered business name
NEXT_PUBLIC_HUNDETIMER_ORG_NUMBER=123456789
NEXT_PUBLIC_HUNDETIMER_SUPPORT_EMAIL=hei@hundetimer.no
```

New routes:

- `/bli-trener`
- `/vilkar/treneravtale`
- `/trainer-agreement/current`
- `/trainer-agreement/[acceptanceId]`

Trainer verification now requires the current trainer agreement to be accepted. The acceptance stores the version, timestamp, full agreement snapshot, SHA-256 hash, IP/header metadata and acceptance method. Admin approval checks for a current acceptance.

## V29.5 - one login and approval-gated trainer access

Hundetimer now uses one account type on the public website. Everyone registers with the same normal Hundetimer account. A user who wants to offer training applies from `/bli-trener`, stays a normal customer while the application is pending, and receives trainer dashboard access only after an administrator approves the application.

Run this migration after `trainer-agreement-upgrade.sql`:

```sql
supabase/single-login-trainer-access-upgrade.sql
```

Main changes:

- Removed the customer/trainer choice from registration.
- New accounts always start as normal customer accounts.
- `/bli-trener` now contains the trainer application and agreement acceptance.
- Pending or rejected applicants cannot access `/trainer-dashboard`.
- Admin approval grants trainer access to the existing account.
- `Min side` remains the normal account destination for customers and approved trainers.
- Approved trainers can still use customer features such as dogs, saved items, bookings, activities and nettkurs.
- `Bli trener` remains in the footer rather than the main navigation.
- Direct client-side changes to `profiles.role` are blocked by a database trigger.

Existing approved trainers are kept as trainers. Existing pending, rejected or not-submitted trainer accounts are converted back to normal customer access until approval.
