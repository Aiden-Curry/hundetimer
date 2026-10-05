# Hundetimer v29.14 - visible card form

This release removes the extra payment-reveal step from Hundetimer checkout.

## Buyer experience

For signed-in customers, the secure Stripe card fields are now already visible on the same page as:

- an online course purchase
- a group course/activity signup
- a private lesson booking

The customer fills in any booking details, enters the card details, and presses one final `Betal ... kr` button. There is no `Fortsett til kortbetaling` / reveal button and no normal navigation to a separate Hundetimer checkout route.

## Stripe implementation

The integration now uses Stripe Payment Element in deferred mode:

1. Stripe.js renders the secure card form immediately using the known NOK amount.
2. No Hundetimer booking/purchase record is created just because the page was opened.
3. On the final pay click, Stripe validates the card fields and creates a ConfirmationToken.
4. The server creates and confirms the PaymentIntent using the server-validated amount and booking details.
5. Any required 3D Secure action is handled by Stripe.
6. Hundetimer redirects to the relevant booking/course confirmation page after payment/authorization.

Private lesson request bookings continue to use manual capture. Group activities and online courses use normal immediate capture.

## Existing payment logic retained

- 29 kr customer service fee
- trainer/platform commission calculations
- promotions/discounts
- private booking authorization before trainer approval
- Stripe webhook backup processing
- refunds/cancellations
- group waitlist capacity handling
- online course access only after captured payment

## Environment

Keep:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Database

No Supabase migration is required for v29.14.

## Compatibility

The older `/checkout/...` routes are left in the codebase only as compatibility/fallback routes for older local test records. New purchases do not use them.
