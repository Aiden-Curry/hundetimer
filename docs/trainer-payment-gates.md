# Trainer access and payments

Apply `supabase/trainer-payment-gates-upgrade.sql` in Supabase before deploying
the dashboard access changes. It adds database triggers without replacing RLS
policies. This is required because services and online courses are saved directly
through the authenticated Supabase client.

Admin approval, the trainer role and both agreement signatures still control
dashboard access. Stripe readiness controls paid publication and checkout, not
access to editing and settings. Drafts remain editable. Checkout and private
booking capture also check trusted Connect v2 readiness on the server. Existing
cancellation and refund paths remain available.

Stripe readiness uses the existing account ID, details-submitted, payouts-enabled
and transfers-active fields maintained by the Connect v2 integration. No Stripe
configuration changes are needed.
