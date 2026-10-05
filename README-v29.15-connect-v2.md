# Hundetimer - Stripe Connect Accounts v2 merge

This build uses the new Codex-designed website as the base and changes only the Stripe Connect trainer onboarding internals.

## Changed files

- `app/api/stripe/connect/onboard/route.ts`
- `app/api/stripe/connect/return/route.ts`
- `lib/stripe/sync.ts`

## Connect flow

New trainer Connect accounts are created with Stripe Accounts v2:

- `stripe.v2.core.accounts.create()`
- country: Norway
- dashboard: Express
- configuration: Recipient
- requested capability: `stripe_balance.stripe_transfers`
- platform collects fees and is responsible for losses

Hosted onboarding uses:

- `stripe.v2.core.accountLinks.create()`
- `account_onboarding`
- Recipient configuration only

After Stripe returns the trainer to Hundetimer, the account is retrieved with Accounts v2 and Hundetimer stores the current onboarding/readiness state in the existing `trainer_payment_accounts` table.

## Database

No new migration is required.

The existing columns remain in use:

- `stripe_account_id`
- `details_submitted`
- `payouts_enabled`
- `transfers_active`

## Existing old test account

If a trainer was already linked to an old v1 test account and Stripe rejects it in the new flow, reset only that test trainer before onboarding again:

```sql
update public.trainer_payment_accounts
set
  stripe_account_id = null,
  details_submitted = false,
  payouts_enabled = false,
  transfers_active = false,
  updated_at = now()
where trainer_id = 'PUT-TEST-TRAINER-UUID-HERE';
```

Do not reset a real connected account with payout history without reconciling it first.

## Environment

Keep your existing `.env.local`. The returned ZIP intentionally does not include `.env.local`.

Required Stripe variables include:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Verification performed

- Confirmed installed Stripe version is 22.6.2.
- Confirmed the installed SDK exposes `stripe.v2.core.accounts.create`, `stripe.v2.core.accounts.retrieve`, and `stripe.v2.core.accountLinks.create`.
- TypeScript reported no errors in the new Connect onboarding, return, or sync files.
- The uploaded project contains unrelated pre-existing TypeScript errors in other checkout/newsletter files. Those were not changed in this merge.
