# Signup — Production Roadmap

> Group 2: Authentication · Screen 7 of 33 (Auth batch 2 of 5)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

Account creation. A full-name / email / password form with a live password-strength meter, a pre-signup throttle gate, and a Google OAuth path. On success it sends a confirmation email and routes the user to Login.

> **Audit this screen as part of one lifecycle, not in isolation.** Signup is the entry point of the auth funnel; the confirmation link it triggers lands on the Auth Callback (screen 10).

---

## 1. UX & Core Features

**Current state**
- Three labeled fields with inline validation and a password-strength indicator.
- A pre-signup server gate runs before the account is created.
- Google OAuth as a secondary path with a divider.
- On success, shows a persistent "check your inbox" view with resend, preserving the redirect target.

**Gaps & risks** — addressed
- [x] **Persistent confirmation handoff** — replaced the transient success toast with a dedicated "check your inbox" state with resend + start-over.
- [x] **Redirect / plan continuity** — `redirect` and `plan` search params are forwarded into `/login`, into the email confirmation `next=…` URL, and into the Google OAuth `redirectTo`.
- [x] **Non-enumerating duplicate handling** — Supabase's `identities: []` response and any `user_already_exists` error code resolve to a neutral notice ("If this email already has an account, sign in or reset your password").
- [x] **Client/server password parity** — extracted shared `src/lib/password-policy.ts` enforcing length 8, complexity, score ≥ 3; HIBP rejections from the server still surface through `mapAuthError` and focus the password field.
- [x] **Focus + a11y** — first field auto-focuses on mount, a Tab focus-trap mirrors Login, errors render in a persistent `aria-live` summary instead of toasts.

**World-class targets**
- [x] Persistent post-submit confirmation screen with resend.
- [x] Guaranteed redirect-param + plan continuity into Login and onward to the callback.
- [x] Client strength rules that mirror the server policy exactly (shared module).
- [x] Clear, non-enumerating messaging for duplicate/unconfirmed accounts.

---

## 2. Performance & Speed

- [x] Signup route stays lean — no marketing chunks, no new lazy imports; `PasswordStrength` is a tiny component.
- [x] Strength meter and inline errors render inside reserved-height containers (`min-h-[2.25rem]` / `min-h-[2.5rem]`) — no layout shift.
- [x] OAuth handoff is a single `signInWithOAuth` call; no extra round-trips before first paint.

---

## 3. Backend & Cloudflare/Supabase Compliance

- [x] **Pre-signup throttle** runs before `supabase.auth.signUp` and the validator now also length-bounds `fullName` for server-side parity (`src/lib/auth-throttle.functions.ts`).
- [x] **Confirmation redirect origin** is built from `window.location.origin` so it always matches the deployed Cloudflare domain at runtime; `PENDING_SQL_COMMANDS.sql` documents the required Supabase Auth → URL Configuration whitelist.
- [x] **Edge compliance** — the route uses only Supabase JS and Web `fetch`; no Node-only modules added.
- [x] **Server-side validation** mirrors client bounds (email max 255, fullName 2–80); password policy (incl. HIBP) stays enforced by Supabase Auth and is never bypassed.
- [x] **Secrets** — `signup.tsx` imports nothing from `client.server.ts`; only the publishable key path reaches the browser.

---

## 4. Interconnection (cross-screen lifecycle)

- [x] **Outbound to Login (screen 6):** post-submit and footer-link navigations forward `redirect` + `plan`.
- [x] **Outbound to Auth Callback (screen 10):** both the email-confirmation link and the Google OAuth path land on `/auth/callback?next=…` with `plan` folded into the destination URL.
- [x] **Shared policy with Reset Password (screen 9):** `src/lib/password-policy.ts` is the single source of truth; screen 09 will import the same module.

---

## 5. Actionable Steps (production checklist)

- [x] Replace the transient success toast with a persistent "check your inbox" confirmation state that explains the unconfirmed status and offers resend.
- [x] Guarantee the `redirect` (and `plan`) param is forwarded into Login and preserved through to the callback.
- [x] Add clear, non-enumerating messaging for duplicate-email and already-confirmed accounts.
- [x] Align the client password-strength rule with the server policy and HIBP enforcement so "strong" passwords are never rejected server-side.
- [x] Auto-focus the first field and trap focus; add a persistent accessible error summary.
- [x] Verify the confirmation redirect origin exactly matches the live Cloudflare domain (documented in `PENDING_SQL_COMMANDS.sql`).
- [x] Confirm server-side validation mirrors client bounds and the throttle runs before account creation.
- [x] Reserve layout space for the strength meter and inline errors to prevent layout shift.
- [x] Confirm the signup path is fully edge-compatible (no Node-only dependencies).
