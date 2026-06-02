# Group 01 — Marketing & Auth · Principal-Auditor Cross-Reference Report

> Scope: Screens 01–10 (Landing, About, Contact, Pricing, Templates, Login, Signup, Forgot Password, Reset Password, Auth Callback).
> Method: Each roadmap's "Actionable Steps", "Backend & Cloudflare/Supabase Compliance", and "Interconnection" claims were cross-referenced against the actual source under `src/routes/`, `src/lib/`, `src/integrations/supabase/`, and `PENDING_SQL_COMMANDS.sql`.
> Output rule: read-only audit. No source modifications performed.

---

## Overall Status: **FINDINGS** (not PASSED)

Most per-screen checklists are honestly delivered. However, the cross-screen **plumbing that ties them together** has two real defects that drop the user's intent (selected plan / template) on the floor in a common funnel path, and several smaller integration risks worth closing before "production-ready" can be claimed for the group.

Counts: **2 high-severity**, **4 medium-severity**, **3 low-severity** findings. Per-screen sections list everything verified clean.

---

## High-severity findings

- [x] **H1 — `_authenticated` guard drops the search string when bouncing to Login.** `src/routes/_authenticated.tsx` sets `search: { redirect: location.pathname }`. Because `pathname` excludes `?…`, the chain *Pricing → `/onboarding?plan=growth-monthly` → unauth bounce → `/login` → user signs in* arrives at `/onboarding` with **no `plan`**. The plan the buyer just chose is silently lost. Replace with `location.href` (or compose `pathname + search`) so the post-login redirect re-enters `/onboarding?plan=…`. Affects roadmaps 04 (Pricing → onboarding deep-link), 05 (Templates → onboarding deep-link), 06 (Login redirect-param faithfulness), 10 (callback "explicit `next` wins" path).

- [x] **H2 — Templates "Use template" hardcodes the plan slug and forgets the template.** `src/routes/templates.tsx` L141–147 links to `/onboarding` with `search={{ plan: "growth-monthly" }}` for **every** card, and never passes the template slug at all. The Templates roadmap (05) explicitly promises "CTAs that deep-link into onboarding with the selected template" and Onboarding's search schema only knows `plan`. Result: the chosen template is dropped, and every template silently steers users to the same plan. Add a `template` search param to `/onboarding`'s `validateSearch` (in `src/routes/_authenticated/onboarding.tsx`) and forward `template.slug` from each card; only set `plan` when the registry entry actually pins one.

---

## Medium-severity findings

- [x] **M1 — Two concurrent `onAuthStateChange` listeners race during the callback.** `src/lib/auth-context.tsx` subscribes globally (and calls `router.invalidate()` + `queryClient.invalidateQueries()` on `SIGNED_IN`). `src/routes/auth.callback.tsx` adds a second subscriber that calls `branch()` on the same event. Both fire on the OAuth/email-confirm exchange; the callback's `navigate({ to, replace: true })` can land in the middle of the global invalidate, causing a transient duplicate render or a stale-loader flash on the destination route. Either gate the callback's branch through a single source of truth (e.g. consume `useSession()` and skip the local subscription) or guard `auth-context`'s invalidate so it no-ops while pathname === `/auth/callback`. The Supabase integration knowledge file is explicit: *"Wire it ONCE at the root — per-component listeners race each other."*

- [x] **M2 — `AuthProvider` PASSWORD_RECOVERY handler can hijack the recovery completion flow.** `src/lib/auth-context.tsx` navigates to `/reset-password` on every `PASSWORD_RECOVERY` event whenever pathname ≠ `/reset-password`. Combined with Reset Password's own state machine (which scrubs the hash on success and `navigate({ to: "/dashboard", replace: true })`), any late-arriving `PASSWORD_RECOVERY` (e.g. from a TOKEN_REFRESHED replay or a slow tab) can yank the user back to `/reset-password` after they've already completed the flow. Add a guard so the navigation only fires when the URL still carries the recovery hash, or wire it through a single in-flight flag.

- [x] **M3 — Login does not declare `plan` in its `validateSearch` schema.** `src/routes/login.tsx` searchSchema is `{ redirect }`. If any future caller (or a deep-linked email) hits `/login?plan=growth&redirect=…`, the `plan` is rejected by `zodValidator` and dropped before the Signup link is rendered. Today the funnel only ever carries `plan` *inside* the `redirect` URL string, so the breakage is latent — but Forgot Password (08) already accepts `plan` at the top level and Signup (07) does too. Login is the outlier; align its schema with siblings and forward it through the "Create an account" / "Forgot?" links the same way `redirect` is forwarded.

- [x] **M4 — `safeRedirect` is not applied to the value embedded in `redirect` before it is round-tripped through Google OAuth's `redirectTo`.** `src/routes/login.tsx` L253–257 and `src/routes/signup.tsx` L221–228 build the OAuth `redirectTo` as `${origin}/auth/callback?next=${encodeURIComponent(next)}`, where `next = redirectTo ?? "/dashboard"`. `redirectTo` here has already been `safeRedirect`-validated (good), but the **callback's** allow-list (`ALLOWED_NEXT_PREFIXES`) is then the only thing protecting against a `next` outside `/dashboard|/onboarding|/checkout|/account|/store/`. That's defensible, but the Login roadmap (06) claims the `redirect` param is "faithfully forwarded" — be aware that any `redirect` pointing at, say, `/admin` will be silently dropped at the callback and fall back to dashboard/onboarding. Either widen the allow-list to include `/admin` (and any other valid authenticated landing surface) or document that those targets must be reached post-redirect, not via `redirect=`.

---

## Low-severity findings

- [x] **L1 — `src/lib/auth-throttle.functions.ts` hardcodes the Supabase project URL** (`const SUPABASE_URL = "https://oaizafpusqryvugjmkyl.supabase.co"`). It is currently unused inside the module, but its presence will rot the day the project is cloned to a new environment. Remove the constant, or replace with `process.env.SUPABASE_URL` inside the handler that needs it.

- [x] **L2 — `auth.callback`'s `recoveryType` inference treats absent hash type as `"oauth"`.** `src/routes/auth.callback.tsx` L116–121: if no `#type=…` arrives (e.g. a fully-exchanged session via `?code=`), `recoveryType` is set to `"oauth"` even when the actual origin was email confirmation or magic link. The downstream `error_expired` CTAs route to `/login` in that case, which is fine, but the copy can mislead users who just clicked an email-confirmation link. Consider an `"unknown"` default and let the CTA copy stay neutral.

- [x] **L3 — Reset Password does not declare a `validateSearch` schema.** `src/routes/reset-password.tsx` reads tokens from `window.location.hash` only (correct under Supabase's `detectSessionInUrl: true`), but any incoming search params are silently dropped. If a future caller wants to pass `redirect`/`plan` into the recovery completion (so a recovered user lands somewhere other than `/dashboard`), the route has no contract for it today. Add `validateSearch` with `redirect` (and `plan`, for parity with Signup/Forgot) and respect it in the success-path `navigate(...)`.

---

## Per-screen verification log

### 01 — Landing Page · PASSED
Verified: `src/lib/leads.functions.ts` persists via `supabaseAdmin` + Zod + `enforceRateLimit`; no Node-only modules; SQL block in `PENDING_SQL_COMMANDS.sql` includes RLS + grants + `ip_hash`. Footer Privacy/Terms routes exist (`src/routes/privacy.tsx`, `src/routes/terms.tsx`). No cross-screen integration gap detected here.

### 02 — About · PASSED
Static, no data layer. CTAs (`/signup`, `/templates`) resolve. `router.preloadRoute({ to: "/signup" })` is wired.

### 03 — Contact · PASSED
`src/lib/contact.functions.ts` matches the roadmap: Zod, honeypot via length bounds, IP rate-limit, `crypto.createHash` (edge-safe), `supabaseAdmin` insert, Resend dispatch. RLS + admin-read policy present in SQL. No PII leaked back to the client.

### 04 — Pricing · PASSED *for SEO/data-source items*, **see H1 / H2** for the deep-link interconnection issue
JSON-LD aligned with `plans` query, monthly/quarterly toggle works. CTA target `/onboarding?plan={slug}` is correct in isolation; the brokenness is in the downstream login bounce (H1).

### 05 — Templates · **FINDINGS — see H2**
Template registry is shared with Onboarding (good), `available` flag is respected (good), preview dialog accessible. The "Use template" CTA payload is the defect.

### 06 — Login · **FINDINGS — see M3 / M4**, otherwise PASSED
`beforeLoad` uses `supabase.auth.getUser()` (revalidates, per integration guidance). MFA path correct. Cooldown is server-authoritative. Resend path covers unconfirmed-account detection deterministically (`isUnconfirmedAccountError`). Outbound links to `/signup` and `/forgot-password` forward `redirect`. Plan param not forwarded (M3).

### 07 — Signup · PASSED
`buildConfirmRedirect` correctly folds `plan` into the email-confirmation destination. OAuth `redirectTo` carries the same. Shared `password-policy.ts` is used. Server validator length-bounds `fullName`. No `client.server` import in the route. `identities: []` duplicate-email branch handled non-enumeratingly.

### 08 — Forgot Password · PASSED
`requestPasswordReset` server fn applies per-email and per-IP windows via `auth_throttle_events`. `redirectTo` is computed from `window.location.origin + /reset-password`. Resend cooldown is real. Error mapping uniform via `mapAuthError`.

### 09 — Reset Password · PASSED *for state-machine + token handling*, **see L3** for the search-contract gap
Deterministic `verifying → ready → invalid` state machine with 10s deadline, hash scrub on success, shared `password-policy.ts`. `navigate({ to: "/dashboard", replace: true })` prevents back-button replay.

### 10 — Auth Callback · PASSED *for server-fn correctness*, **see M1** for the listener race and **H1** for the upstream `next` truncation
`getPostAuthDestination` uses `requireSupabaseAuth` + RLS-scoped `context.supabase` (never `supabaseAdmin`). `ALLOWED_NEXT_PREFIXES` is enforced. `classifyError` matrix is correct. Hash error params parsed pre-scrub.

---

## Cross-cutting verification (Supabase Auth + Edge runtime)

- **Single bearer attacher**: `src/start.ts` registers `attachSupabaseAuth` in `functionMiddleware` alongside `enforceImpersonationReadOnly`. PASSED.
- **Service-role isolation**: `client.server.ts` is only imported by `*.functions.ts` and `*.server.ts` modules; no route file or component imports it. PASSED.
- **Edge compliance**: server fns under audit (`leads`, `contact`, `auth-throttle`, `auth-callback`) use only `crypto.createHash`, `fetch`, `@tanstack/react-start/server`, Supabase JS. No `child_process` / `sharp` / `fs.watch` / `os.cpus`. PASSED.
- **RLS**: `leads`, `contact_messages`, `auth_throttle_events` all `enable row level security` with admin-read policies; writes go through service-role server fns. PASSED.
- **Public read policy on `plans`**: confirm the Pricing query path goes through a public server fn or has a tightly scoped `TO anon` policy (not audited in depth — flag as a follow-up if `src/routes/pricing.tsx`'s `plansQueryOptions` hits the table directly via the browser client).

---

## Recommended fix order

1. H1 (`_authenticated` redirect string) — one-line change with broad blast radius.
2. H2 (Templates payload + Onboarding `validateSearch`) — restores roadmap-05's interconnection promise.
3. M1 + M2 (consolidate `onAuthStateChange` ownership in `auth-context.tsx`) — eliminates a class of redirect/race bugs.
4. M3 (Login `validateSearch` parity) and L3 (Reset Password `validateSearch`) — close the schema gaps.
5. M4 / L1 / L2 — hardening and polish.

**Until items H1 and H2 are addressed, the Group 1 funnel cannot be claimed "100% perfectly interconnected".**
