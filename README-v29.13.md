# Hundetimer v29.13 - inline card checkout

V29.13 removes the extra checkout-page navigation introduced in v29.12.

## Buyer experience

New payments now stay on the page the buyer is already using:

- Online course: the Stripe card form appears inside the course purchase card.
- Group course/activity: the card form appears inside the signup card.
- Private lesson: the card form appears directly below the booking details.

Clicking the purchase/booking button creates the Stripe Checkout Session in the background and then reveals Stripe's secure Payment Element on the same page. The booking details used to create that payment are locked while the payment session is active.

After a successful payment, Stripe still uses the existing `return_url` to open the appropriate Hundetimer confirmation/content page. A bank may also temporarily show 3D Secure authentication when required.

## Payment behavior preserved

- Private lesson/request bookings continue to authorize first and capture according to the existing booking logic.
- Group activities and online courses continue to capture payment immediately.
- Promotions, 29 kr service fee, webhooks, refunds, and Stripe metadata remain unchanged.
- Existing `/checkout/...` routes remain only as compatibility/fallback routes for older in-progress test sessions. New purchase actions no longer redirect to them.

## Small related fix

The online-course page now treats only `payment_status = captured` as an owned course when deciding whether to show `Fortsett kurset`. An abandoned or pending checkout therefore does not grant course access.

## Configuration

Keep the v29.12 Stripe variables:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Database

No Supabase migration is required for v29.13.

## Verification

- 184 TypeScript/TSX files passed a parser syntax check.
- No new npm dependency was added.
