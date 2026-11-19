# Email templates

Branded versions of Supabase's sign-in emails. To use them:

1. Supabase -> Authentication -> Emails -> Templates.
2. For each template, paste the matching file's contents into **Message body** and set the subject:

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your email |
| Magic Link | `magic-link.html` | Your sign-in link |
| Reset Password | `reset-password.html` | Choose a new password |
| Change Email Address | `change-email.html` | Confirm your new email |
| Invite user | `invite.html` | You're invited |

Link lifetimes in the text (1 hour) match Supabase's default "Email OTP Expiration"; change both together.
If you rename the product, replace "Revenue Recovery" in these files too.
Set up your own SMTP sender first (Authentication -> Emails -> SMTP Settings); Supabase's built-in sender only
sends a few emails an hour and may ignore custom templates.
