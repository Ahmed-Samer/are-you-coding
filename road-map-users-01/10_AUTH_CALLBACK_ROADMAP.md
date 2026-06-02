# Auth Callback — Production Roadmap

> Group 2: Authentication · Screen 10 of 33 (Auth batch 5 of 5)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The session-finalization screen. It waits for Supabase to exchange the inbound OAuth/email-confirmation code into a session (a short retry/poll loop), then redirects the user to a safe `next` target. This is the convergence point of the entire auth funnel.

> **Audit this screen as part of one lifecycle, not in isolation.** The callback is where Signup (email confirm), Login (Google), and OAuth in general all converge and where the post-auth destination is decided.

---

## Shared auth lifecycle (mapped here, referenced by screens 6–9)

```text
Signup ──confirm email──> (email link) ──> Auth Callback ──> route by state
   │                                                            │
   └──after submit──> Login (carries redirect param)            ├─ has store ─> Dashboard
                          │                                     └─ no store  ─> Onboarding
       Forgot Password ───┘ (recovery email) ──> Reset Password ──> Dashboard
```

---

## 1. UX & Core Features

**Current state**
- A loading state while the session is being established.
- A retry/poll loop that waits for the exchanged session to appear, then redirects to a validated `next` target (defaulting to the Dashboard).
- The `next` target is validated to prevent open-redirect abuse.

**Gaps & risks**
- [x] **No store-ownership branching.** — addressed: `getPostAuthDestination` server fn (RLS-scoped, `requireSupabaseAuth`) returns `dashboard`/`onboarding`; explicit allow-listed `next` still wins.
- [x] **The poll loop has no timeout/error UI.** — addressed: deterministic state machine (`exchanging | branching | redirecting | error_oauth | error_expired | error_timeout | error_unknown`) with 10s deadline.
- [x] **No differentiation between failure modes.** — addressed: `classifyError` maps `otp_expired`/`access_denied` → expired, OAuth/server errors → oauth, timeouts → timeout, everything else → unknown, each with bespoke copy + CTAs.
- [x] **Loading state should avoid layout shift** — addressed: single `max-w-md` card with `min-h-[12rem]` shared by loading and every error view.

**World-class targets**
- [x] Post-auth branching to Onboarding vs Dashboard, honoring safe `next`. — addressed.
- [x] Bounded wait with actionable error states per failure mode. — addressed.
- [x] Stable, shift-free loading experience. — addressed.

---

## 2. Performance & Speed

- [x] Keep the callback route minimal. — addressed: server fn is a single `head: true` count read; component is local-state-only (no React Query for the callback).
- [x] Tuned poll interval/total wait. — addressed: 250ms poll, 10s deadline, plus `onAuthStateChange` subscription so success is event-driven (poll is only a backstop).
- [x] Avoid layout shift. — addressed: same card footprint across all states.

---

## 3. Backend & Cloudflare/Supabase Compliance

- [x] **Session exchange on the edge.** — addressed: all hash parsing inside `useEffect` (no SSR `window` access); Supabase client's default `detectSessionInUrl` handles the OAuth code exchange; SSR-safe.
- [x] **`next` validation strict.** — addressed: `safeRedirect` (same-origin relative only) + `ALLOWED_NEXT_PREFIXES` allow-list (`/dashboard`, `/onboarding`, `/checkout`, `/account`, `/store/`) so even valid relative paths can't bounce the user into public marketing.
- [x] **Server-validated store-ownership.** — addressed: server fn uses `context.supabase` (user's bearer), never `supabaseAdmin`.
- [x] **Edge compliance.** — addressed: zero Node-only modules; Web `fetch` only via Supabase JS.
- [x] **Secrets stay server-side.** — addressed: no `client.server` import in route or server fn module.

---

## 4. Interconnection (cross-screen lifecycle)

- [x] **Inbound from Signup (Screen 07).** — addressed: hash `type=signup` captured pre-scrub; on expiry, CTAs route to `/login` (not `/forgot-password`).
- [x] **Inbound from Login (Screen 06).** — addressed: `next`, `redirect`, and `plan` search params all parsed; allow-listed `next` honored verbatim; `plan` forwarded to `/onboarding?plan=…` only when branching there.
- [x] **Relationship to Reset Password (Screen 09).** — addressed: recovery emails go directly to `/reset-password`; documented in `PENDING_SQL_COMMANDS.sql` so future devs don't reroute through the callback and consume the recovery token.
- [x] **Outbound to Dashboard or Onboarding.** — addressed: branching server fn drives the decision; explicit `next` wins when allow-listed; fallback to `/dashboard` on server-fn error so the user is never stranded.

---

## 5. Actionable Steps (production checklist)

1. [x] Post-auth branching via server-validated store-ownership. — addressed (`src/lib/auth-callback.functions.ts`).
2. [x] Bounded session-wait with explicit error state. — addressed (10s deadline → `error_timeout`).
3. [x] Differentiated failure modes with actionable messaging. — addressed (`error_oauth` / `error_expired` / `error_timeout` / `error_unknown`, each with tailored CTAs).
4. [x] Strict `next` validation. — addressed (`safeRedirect` + allow-list).
5. [x] Cloudflare-edge compatible code exchange. — addressed (Supabase JS only, no Node-only deps, all `window` reads inside `useEffect`).
6. [x] Eliminate layout shift. — addressed (shared `min-h-[12rem]` card footprint).
7. [x] Branching from a revalidated identity. — addressed (`requireSupabaseAuth` revalidates the bearer server-side via `getUser`-equivalent; no cached client guess).
