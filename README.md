# Hundetimer v29.14 - visible card form

The Stripe card form is now visible immediately on the product/booking page. Customers fill in their details and card and press one final payment button. See `README-v29.14.md` for details.

# Hundetimer v29.11 - notifications, paid courses and cookie consent

This update builds on v29.10.

## Changes

### Notification read state

- Every notification now has its own `Marker som lest` / `Marker som ulest` control.
- Opening a notification still marks it as read automatically.
- `Marker alle som lest` remains available.
- The header unread count is revalidated when notification read state changes.

Run the new Supabase migration:

```text
supabase/notification-read-toggle-upgrade.sql
```

Run it after `notifications-upgrade.sql` and after the other migrations already used by your current database.

### Mine kurs

- `Min side > Mine kurs` now queries only purchases where:
  - `status = active`
  - `payment_status = captured`
- Incomplete, abandoned, cancelled or unpaid online-course checkouts no longer appear under Mine kurs.
- The old `Betaling behandles` state has been removed from the Mine kurs UI.

No database migration is required for this part.

### Cookie consent

- Added a cookie consent panel in the bottom-right corner.
- Non-essential categories default to off.
- Users can choose `Godta alle`, `Kun nødvendige`, or customize analytics/marketing consent.
- The decision is remembered for 180 days in a first-party consent cookie.
- Added `Cookieinnstillinger` in the footer so a visitor can reopen the panel and change/withdraw consent later.
- Added a public `/personvern` information page.
- The site currently has no Google Analytics, Meta Pixel, Hotjar or similar non-essential tracker installed. The consent categories are ready for future integrations, which should read the stored consent before loading any such script.

No database migration is required for cookie consent.

## Verification

- 179 TypeScript/TSX files passed a parser syntax check with 0 parser errors.
- No new npm dependencies were added.

## v29.12 - integrated card checkout

Card entry now happens inside Hundetimer for private bookings, group activities and online courses using Stripe Payment Element with Checkout Sessions `ui_mode: "elements"`.

Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` to `.env.local`. No SQL migration is required.

## v29.13 - inline card checkout

Card payment no longer sends buyers to a separate Hundetimer checkout route before payment. The Stripe Payment Element is created in the background and revealed directly on the online-course, activity-signup, or private-booking page. See `README-v29.13.md`.
