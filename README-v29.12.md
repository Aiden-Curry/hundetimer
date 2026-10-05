# Hundetimer v29.12 - integrated card checkout

This update replaces the Stripe-hosted payment-page redirects with Stripe Payment Element forms rendered inside Hundetimer.

## Payment flows updated

- Private lesson bookings
- Group courses / activities
- Online courses

The buyer now creates the booking/purchase as before and is then sent to an internal Hundetimer checkout route. The card form itself is injected securely by Stripe.js, so Hundetimer does not receive or store raw card numbers.

Private lessons keep the existing manual-capture logic. Group activities and online courses keep immediate capture. Existing Checkout Session webhooks and fulfilment/sync logic remain in use.

## Required environment variable

Add the Stripe publishable key to `.env.local` alongside the existing secret key:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Use test keys while testing. Switch both Stripe keys to live-mode keys together when going live.

## Database

No Supabase migration is required for v29.12.

## Checkout routes

- `/checkout/booking/[id]`
- `/checkout/activity/[id]`
- `/checkout/online-course/[id]`

The existing cancellation endpoints remain responsible for expiring the Checkout Session and releasing held inventory/promotions. Group and online-course cancellation routes now also verify ownership before cancelling.

## Stripe implementation

Uses Checkout Sessions with `ui_mode: "elements"` and `return_url`, plus Stripe.js loaded directly from `js.stripe.com`. No new npm dependency is required.

## Verification

183 TypeScript/TSX files passed a TypeScript parser syntax check with 0 parser errors.
