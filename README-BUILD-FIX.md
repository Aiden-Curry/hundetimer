# Hundetimer launch build fix

This package is the cleaned Codex redesign + Stripe Connect Accounts v2 + launch fixes.

Build fixes included:

- Fixed `app/book/actions.ts` result narrowing around `syncBookingPaymentIntent`.
- Fixed nullable newsletter profile handling.
- Removed the obsolete `/checkout/...` compatibility routes and `embedded-stripe-checkout.tsx`. The current inline/deferred Payment Element flow remains.
- Added TypeScript exclusions for old `Hundetimer-v29.*` backup folders so accidental local backups do not enter the production type check.
- `next` is pinned to `16.3.8` in `package.json`.
- `package-lock.json` is intentionally omitted because the previous lock belonged to Next 16.0.0. Run `npm install` once to create a fresh lock for Next 16.3.8, then commit that lock before deployment.

Recommended clean install:

```powershell
npm install
npm run build
```

If working in the old project folder, delete old top-level backup directories such as `Hundetimer-v29.4` and `Hundetimer-v29.5` before deployment.
