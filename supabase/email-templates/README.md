# Auth email templates

Source of truth for the Supabase **Authentication → Emails → Templates**. Edit
here, then paste the matching file into the Supabase dashboard (templates are
not yet managed via config/migrations).

All link-based templates point at the app's `/auth/confirm` route with a
`token_hash` + `type`, which verifies the token server-side (see
`src/app/auth/confirm/route.ts`) — this works cross-device and avoids email
link-scanners consuming the PKCE code.

| File | Supabase template | `type` | lands on |
| --- | --- | --- | --- |
| `confirm-signup.html` | Confirm sign up | `signup` | `/command` |
| `invite.html` | Invite user | `invite` | `/onboarding` |
| `magic-link.html` | Magic Link | `magiclink` | `/command` |
| `change-email.html` | Change Email Address | `email_change` | `/account` |
| `reset-password.html` | Reset Password | `recovery` | `/reset-password` |
| `reauthentication.html` | Reauthentication | — (OTP code) | — |

Email is delivered via custom SMTP (Resend) from `noreply@openkuasa.com`.
