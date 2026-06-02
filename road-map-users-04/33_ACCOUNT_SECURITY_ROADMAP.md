# Screen 33 — Account Security (TOTP MFA, Sessions, Password)

Stack: Supabase Auth + Cloudflare Pages (Workers/Edge). Phase 04, screen 33 of 33. Account-wide (not tenant-scoped). Lockout risk is real — recovery codes and per-user throttling are mandatory.

## UX & Core Features

- [ ] Section: Two-factor authentication (TOTP)
- [ ] "Add authenticator" button with device-name input
- [ ] Enrollment panel with QR code (rendered from Supabase data URI, never sent to third-party) and manual secret reveal
- [ ] 6-digit code input with auto-advance and paste support
- [ ] Verify-and-enable button (disabled until 6 digits entered)
- [ ] Recovery codes panel shown ONCE on successful enrollment with download / copy / "I saved these" confirmation gate
- [ ] Enrolled factors list with friendly name, type, status, added date, remove action
- [ ] Remove-factor confirmation gated by re-authentication (password or fresh MFA code)
- [ ] Section: Password
- [ ] Change-password form: current, new, confirm — with strength meter
- [ ] "Sign out all other sessions" checkbox on password change (default on)
- [ ] Section: Sessions
- [ ] Sessions list: device, IP (country only by default), last seen, current-session badge
- [ ] "Revoke" per session and "Revoke all other sessions" button
- [ ] Section: Account deletion (with grace period)
- [ ] Delete-account button with re-auth + typed confirmation + grace-period explanation
- [ ] Loading skeleton matching section geometry
- [ ] Error state with retry
- [ ] Reduced-motion respected on QR/secret reveal animation
- [ ] Toasts on enable / verify / remove / password change / revoke; inline errors on invalid code or weak password

## Performance & Speed

Each section loads its own slice via dedicated server fns. QR rendered from the Supabase-returned data URI inline (no external image service). Throttle counters checked server-side with short Redis-like TTL semantics implemented in Postgres or KV.

## Backend & Cloudflare/Supabase Compliance

Throttling: `recordMfaEnroll` / `recordMfaVerify` server fns key throttle on `(user_id, ip_prefix)` — NOT `ip` alone, to avoid locking out users on shared networks (corporate NAT, mobile carriers). Unenroll requires re-authentication via either a fresh password challenge or a fresh MFA code submission — never a plain `confirm()` dialog. Recovery codes generated server-side at enrollment, hashed before storage, and shown to the user ONCE; consumption is single-use and marked atomically. Password change forces a session refresh and signs out all other sessions when the user opts in. Account deletion enters a grace-period state (e.g. 14 days) during which sign-in shows a "cancel deletion" CTA; hard-delete runs from a cron route after the grace period. All security-relevant events (enroll, verify, remove, password change, session revoke, deletion request/cancel/finalize) write to `audit_log` with IP and user-agent. Edge-safe — no Node-only crypto packages; use Web Crypto and Supabase Auth helpers only.

## Actionable Steps

1. - [ ] Confirm `recordMfaEnroll` and `recordMfaVerify` throttle keys are `(user_id, ip_prefix)`, not `ip` alone
2. - [ ] Generate and store hashed recovery codes at enrollment; surface plaintext to the user ONCE
3. - [ ] Add "I saved these" confirmation gate before dismissing the recovery-codes panel
4. - [ ] Implement recovery-code-consume server fn (single-use, atomic mark)
5. - [ ] Gate factor unenroll behind fresh re-auth (password or MFA code), not `confirm()`
6. - [ ] Implement password-change server fn that signs out other sessions when opted in
7. - [ ] Implement sessions list server fn with masked IP (country only by default)
8. - [ ] Implement revoke-session and revoke-all-other-sessions server fns
9. - [ ] Implement account-deletion request server fn with grace-period state
10. - [ ] Implement cancel-deletion server fn during grace period
11. - [ ] Implement hard-delete cron route that runs after grace period
12. - [ ] Add audit log entry on every security-relevant event with IP and user-agent
13. - [ ] Respect reduced-motion on QR/secret reveal
14. - [ ] Add error boundary with retry
15. - [ ] Verify no Node-only crypto deps; use Web Crypto and Supabase Auth helpers
16. - [ ] Add e2e test: throttling does not lock out a second user behind the same NAT
17. - [ ] Add e2e test: unenroll requires fresh re-auth
18. - [ ] Add e2e test: recovery code consumes single-use atomically under concurrency
19. - [ ] Add e2e test: password change with "sign out others" terminates other sessions
20. - [ ] Add e2e test: account deletion grace period allows cancel and blocks new sign-ins gracefully