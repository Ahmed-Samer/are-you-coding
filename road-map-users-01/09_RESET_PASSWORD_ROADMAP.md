# Reset Password — Production Roadmap

> Group 2: Authentication · Screen 9 of 33 (Auth batch 4 of 5)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The recovery-completion screen. It detects the inbound recovery context from the email link, lets the user set a new password (with a strength meter and confirmation field), and on success signs them in and routes into the authenticated area.

> **Audit this screen as part of one lifecycle, not in isolation.** Reset Password is the second half of the recovery flow; it consumes the token context produced by Forgot Password (screen 8).

---

## 1. UX & Core Features

**Current state**
- Deterministic `verifying → ready → submitting → success` / `invalid` state machine governs the entire screen.
- Inbound recovery context is parsed from the URL fragment, with a 10s safety timeout and a fragment-consumed-by-Supabase race guard.
- Once ready, presents a new-password field (with shared-policy strength meter) and a confirm-password field, with inline validation and matching-password enforcement.
- On success, signs the user in and routes into the authenticated area; on token errors at submit time, falls back to the invalid state.

**Gaps & risks** — addressed
- [x] **The verifying state can hang silently** — replaced with a deterministic state machine; if `PASSWORD_RECOVERY` / `SIGNED_IN` is not emitted within 10 seconds the screen transitions to `invalid` automatically, and any hash-encoded `error=` / `error_code=` from Supabase short-circuits straight to `invalid`.
- [x] **Relies on URL-fragment token detection** — hardened: hash parsing runs only inside `useEffect` (SSR-safe), `onAuthStateChange` is subscribed before the race-condition `getSession()` probe, and on success the fragment is scrubbed via `history.replaceState` so a refresh cannot replay a used token.
- [x] **No focus management** — the password field auto-focuses on `ready` via RHF's `setFocus`, and a Tab focus-trap is wired around the form container (same pattern as Login / Signup / Forgot Password).
- [x] **Strength rule must match policy** — local `scorePassword >= 2` rule removed; the Zod schema now consumes `meetsPasswordPolicy` + `PASSWORD_REQUIREMENT_MESSAGE` from `src/lib/password-policy.ts`, identical to Signup. HIBP / weak-password rejections from Supabase still surface via `mapAuthError` and refocus the password field.

**World-class targets**
- [x] Deterministic ready / verifying / invalid / submitting / success state machine with a clear path back to re-request a link.
- [x] Robust fragment-token handling that works under edge SSR and hydration (SSR-safe default, post-mount parsing, race-guarded session probe, post-consumption scrub).
- [x] Focus moved to the password field on ready; full accessible validation (aria-live error region, `aria-invalid`, sr-only state landmark).

---

## 2. Performance & Speed

- [x] Route stays lean — only `PasswordStrength` is added (already shared with Signup), no lazy chunks, no marketing imports.
- [x] Strength meter does not block readiness — it lives inside the form, rendered only after `ready`.
- [x] No layout shift: the outer container (`mx-auto max-w-md px-6 py-16`) is identical across all states, the persistent error region reserves `min-h-[2.5rem]`, the strength-meter slot reserves `min-h-[2.25rem]`, and the verifying / invalid / success cards reserve `min-h-[10rem]` to match the form's vertical footprint.

---

## 3. Backend & Cloudflare/Supabase Compliance

- [x] **Token handling on the edge:** all fragment parsing is client-only; the Supabase client (with `detectSessionInUrl: true`) persists the recovery session via its configured storage so the next `updateUser` call carries the right bearer token across the routing boundary.
- [x] **Password policy enforcement (incl. HIBP)** is enforced server-side by Supabase Auth; the client mirror is the same shared module as Signup, so a "strong" client password is never rejected server-side except by HIBP — which surfaces through `mapAuthError`.
- [x] **Edge compliance:** only `supabase.auth.updateUser` (Web `fetch` under the hood) is used; no Node-only modules, no new server functions, no new imports from `client.server.ts`.
- [x] **Secrets stay server-side:** route uses only the publishable-key browser client.

---

## 4. Interconnection (cross-screen lifecycle)

- [x] **Inbound:** consumes the recovery hash produced by Forgot Password's `redirectTo = ${origin}/reset-password`. Origin / whitelist requirements are documented in `PENDING_SQL_COMMANDS.sql`.
- [x] **Outbound:** on success, `navigate({ to: "/dashboard", replace: true })` — `replace: true` prevents the back button from returning to the now-consumed reset URL; the established session is recognized by `_authenticated`.
- [x] **Shared policy with Signup (screen 7):** identical password-strength rules via `src/lib/password-policy.ts`.
- [x] **Failure fallback to Forgot Password (screen 8):** the `invalid` state's primary CTA is `<Link to="/forgot-password">Request a new link</Link>`; a secondary CTA links to `/login` for users who remembered their password.

---

## 5. Actionable Steps (production checklist)

- [x] Add an explicit expired/invalid/used-token state with a clear path back to Forgot Password.
- [x] Add a timeout to the "verifying" state so it never hangs silently.
- [x] Harden URL-fragment token detection to survive SSR/edge routing and hydration.
- [x] Auto-focus the password field on ready and add a focus-trap.
- [x] Align the client strength rule with the server policy and HIBP enforcement (identical to Signup).
- [x] Reserve layout space across verifying/form/error states to prevent layout shift.
- [x] Confirm token handling and session writes work under the Cloudflare edge runtime (no Node-only dependencies).
