# Amino password reset repair

Status: website fixes implemented locally; production email migration awaiting domain verification.

## Confirmed production failure

Supabase project ohbaejypepfzyenizyhd returns HTTP 500 from /recover. Auth logs identify Amazon SES rejecting the configured sender, Amino Fit <no-reply@amino.fit>, as unverified in us-east-1. The custom SMTP host is email-smtp.us-east-1.amazonaws.com:587. SMTP credential authentication is not the reported failure. The available AWS API credential authenticates successfully, but sts:GetAccessKeyInfo and ses:GetAccount are denied because no identity-based policy allows them. Requests for the configured sender identities also return 403. Therefore the SMTP account match, sender identity details, and sandbox status remain unverified; no AWS settings were changed.

The published password-reset JavaScript also requested a redirect to an old Vercel preview deployment that is absent from the Auth redirect allow-list. The production https://www.amino.fit/password-change destination loads and is allowed.

## Local fixes

- Submit the reset request through the form handler, prevent navigation, block duplicate submissions, and keep the form usable after an error.
- Use the website origin for the password-change redirect.
- Use a separate sessionStorage-backed recovery client, matching the mobile implicit-link flow; existing website login cookies cannot select the account to update.
- Validate recovery tokens before enabling password entry; reject expired, malformed, and non-recovery links. Failed links clear any earlier recovery session. Legacy PKCE links ask for a fresh email.
- Validate password confirmation and handle returned Auth errors before reporting success.
- Connect the login page's Forgot password link.

## Resend setup

The user selected Resend and supplied AMINO_RESEND_KEY for the account under seb@hedge.so. The key is stored only in the ignored .env.prod file; this report contains no credential. The API key works. Domain amino.fit was added with sending enabled and receiving disabled.

Domain ID: e4e60161-5d22-457d-b362-6b6f170a0b93

Authoritative DNS is hosted on ns1/ns2/ns5.101domain.com. Add the following records to the amino.fit zone. Names are relative to amino.fit; use the provider's default TTL. Preserve existing records, particularly the root domain's mail routing.

| Type | Name | Value | Priority |
| --- | --- | --- | --- |
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDG0lHnYDLXw0YxFhcL8rmWnV21eJ1GVElEZ08qCe4lci6LCXpESMCaiCusu3jj1dzQaaPuVLCiZU2pvFx0oKDM1B+NdnDhnNeEYjYtZmpCJedyKfOJvhWh8BP2yPxt4nHo6zaLf4bWEFN5o9ymKQQJTC7rZAo4cs5Fm/aYl39jXQIDAQAB | — |
| MX | send | feedback-smtp.us-east-1.amazonses.com | 10 |
| TXT | send | v=spf1 include:amazonses.com ~all | — |
| CNAME | rsend | send.forge.rmta.net | — |

After Resend reports verified, configure Supabase Auth SMTP with host smtp.resend.com, port 465, username resend, password from AMINO_RESEND_KEY, sender no-reply@amino.fit, and sender name Amino Fit. Production SMTP has not yet been changed.

## Verification

The current mobile ForgotPassword screen requests `${AminoApiUrl}/password-change` after trimming trailing slashes. Its Supabase client uses the default implicit flow with URL detection disabled on native. The website recovery client accepts that implicit recovery-link format. The mobile audit reports 30 passing source-level checks and a successful iPhone build/install, with launch blocked by a locked phone. Those checks do not establish email delivery.

- node --test tests/password-recovery.test.cjs: 15 passing tests, including an installed-Supabase-SDK request test against a mocked transport.
- npm run lint: passed with four existing unrelated React hook warnings.
- TypeScript: only the two pre-existing missing next-auth imports in src/app/api/test.ts fail.
- Local browser with mocked Auth: SMTP failure displays a retryable error, retaining the address; retry displays the neutral success message. Expired links show a request-new-link error and no password-entry form.
- No real recovery email has been sent by this task and no real password has been changed. No production web deployment has been performed.

## References

- [Supabase SMTP and default-provider limitations](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend SMTP configuration for Supabase](https://resend.com/docs/send-with-supabase-smtp)
