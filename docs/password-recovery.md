# Password recovery

The request page is `/forgot-password`. It passes the Turnstile token to Supabase
and uses this production redirect URL:

```text
https://hundetimer.no/auth/callback?next=%2Freset-password
```

Allow this redirect URL in Supabase Authentication → URL Configuration (and the
equivalent localhost URL when testing locally). Keep the production Site URL set
to `https://hundetimer.no`.

The standard recovery email confirmation URL supports the existing PKCE code
callback. For a custom SSR Reset Password email template, use:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=/reset-password">Lag et nytt passord</a>
```

Change only the Reset Password template; the signup confirmation flow is separate.
Both recovery callback formats are supported. The reset page requires a valid
Supabase session, then uses `auth.updateUser({ password })`.

New passwords must contain at least 10 characters; longer passwords are allowed.
Keep Supabase's minimum password policy at 10 as well. Login accepts existing
passwords without imposing the new-password length rule.

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` must be present when building the frontend.
The Turnstile secret belongs only in Supabase, and CAPTCHA enablement is managed
there. No Supabase settings or email templates were changed by this implementation.

Local tests mock the email and password-update calls. Before release, test a real
recovery email, an expired/reused link, and the final password update on a test account.
