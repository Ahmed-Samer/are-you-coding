# Forgot Password — Production Roadmap

> Group 2: Authentication · Screen 8 of 33 (Auth batch 3 of 5)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The recovery-initiation screen. An email form that calls a throttled server function which triggers the Supabase recovery flow, then shows a neutral "check your inbox" state regardless of whether the account exists (no enumeration).

> **Audit this screen as part of one lifecycle, not in isolation.** Forgot Password is the first half of the recovery flow; it defines the `redirectTo` that determines where Reset Password (screen 9) receives the user.

---

## 1. UX & Core Features

**Current state**
- A single email field with inline validation and a clear primary action.
- On submit, a server function applies per-email and per-IP throttling, then calls the recovery endpoint.
- A neutral success state is shown ("if an account exists…") that does not reveal account existence.
- A link back to Login.

**Gaps & risks** — addressed
- [x] **Resend / cooldown affordance on the success state** — the success view now exposes a `Resend reset link` button with a 60s client-side cooldown ticker; rate-limit responses from the server-fn surface in the persistent inline error region (no toast) while the cooldown remains active.
- [x] **Recovery `redirectTo` is origin-sensitive** — `redirectTo` is computed at submit time from `window.location.origin + "/reset-password"`, so it always matches the live Cloudflare domain at runtime. `PENDING_SQL_COMMANDS.sql` documents the required Supabase Auth → URL Configuration whitelist for both production and preview origins.
- [x] **Error mapping never leaks existence** — all error paths flow through `mapAuthError`, which normalizes rate-limit / transport messages without distinguishing "no such account"; the server-fn additionally suppresses Supabase recovery errors so the client cannot infer existence even on transport failure.
- [x] **Focus-trap / first-field focus on mount** — the email input auto-focuses on mount; a Tab focus-trap mirrors the Login and Signup screens for both the form view and the success view.

**World-class targets**
- [x] Success state with a rate-limit-aware resend option and clear next steps.
- [x] `redirectTo` guaranteed to match the live Cloudflare domain (runtime origin + dashboard whitelist).
- [x] Strictly non-enumerating behavior across all outcomes (success copy, error mapping, and resend path are uniform).

---

## 2. Performance & Speed

- [x] Minimal, fast screen; no heavy assets and no new lazy imports.
- [x] No layout shift when toggling between form ↔ success states — the persistent error region reserves `min-h-[2.5rem]` and both views share the same `max-w-md` container.
- [x] Route bundle stays lean — no marketing chunks, only existing `ui/*` primitives.

---

## 3. Backend & Cloudflare/Supabase Compliance

- [x] **Throttling is the real control** — `requestPasswordReset` enforces per-email (3/h) and per-IP (5/h) windows via `auth_throttle_events`; the success view is shown unconditionally so it never betrays whether an email was actually sent.
- [x] **`redirectTo` points at the live Cloudflare domain** and at the `/reset-password` route specifically; whitelist requirements documented in `PENDING_SQL_COMMANDS.sql`.
- [x] **Edge compliance** — the recovery initiation uses Web-standard `fetch` to `/auth/v1/recover` from the server fn; no Node-only modules.
- [x] **Secrets stay server-side** — only the publishable key reaches the browser; the recovery call is initiated server-side via `supabaseAdmin` / `SUPABASE_PUBLISHABLE_KEY` inside the server fn.

---

## 4. Interconnection (cross-screen lifecycle)

- [x] **Inbound from Login (screen 6):** `/forgot-password` accepts `redirect` (and tolerates `plan`) via `validateSearch`, so users bounced through recovery return to their original destination on sign-in.
- [x] **Outbound to Reset Password (screen 9):** `redirectTo` is exactly `${origin}/reset-password`; the recovery email carries the token context. No `next` / `plan` is folded in — the recovery flow ends at sign-in by design.
- [x] **Shared non-enumeration contract:** success copy ("If an account exists for {email}…") is aligned with Login's neutral failure copy and Signup's duplicate-account notice.
- [x] **Shared password policy (forward-looking):** Screen 09 (Reset Password) will consume `src/lib/password-policy.ts` and `<PasswordStrength />` directly — Forgot Password itself does not collect a password.

---

## 5. Actionable Steps (production checklist)

- [x] Add a rate-limit-aware resend option (with cooldown indication) to the success state.
- [x] Guarantee the recovery `redirectTo` resolves to the live Cloudflare domain and the Reset Password route.
- [x] Ensure all error paths remain strictly non-enumerating (no "account not found").
- [x] Auto-focus the email field and add an accessible inline error region.
- [x] Reserve layout space so swapping to the success state causes no layout shift.
- [x] Confirm the recovery initiation is edge-compatible (no Node-only dependencies) and throttled per-email and per-IP.
