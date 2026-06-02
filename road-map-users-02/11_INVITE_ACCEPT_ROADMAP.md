# Invite Accept — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 11 of 18
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The entry point for a team member joining an existing tenant store. A tokenized link auto-accepts the invitation once the user's session hydrates, then routes them into the store. This screen is the bridge between the Auth lifecycle (Phase 01) and the multi-tenant store admin surface.

---

## 1. UX & Core Features

**Current state**
- Token is read from the URL search params with a length-bounded schema.
- Acceptance auto-fires exactly once after the session is hydrated and both a user and token are present (guarded by a ref so it never double-submits).
- Rich, distinct branches are handled: invalid/missing token, loading, signed-out, email mismatch (wrong account), expired, revoked, already-accepted, and success.
- Signed-out users are pointed at sign in / create account with a redirect back to the invite link.

**Gaps & risks**
- **No abuse/rate-limit guard** on token submission — a malicious actor can brute-force tokens against the accept endpoint without throttling.
- **Redirect continuity is hand-built**: the "return to invite" link is assembled as a raw query string rather than passing through the shared safe-redirect helper, which weakens the open-redirect guarantees established in the Auth batch.
- **Transient states are visually inconsistent** — the "Loading your invite" and "Accepting your invite" spinners use different containers than the result cards, causing a layout jump between phases.
- **No focus management**: when a branch swaps in (e.g. email mismatch), focus is not moved to the new heading/action, hurting screen-reader and keyboard users.
- **Success state navigates immediately** while showing a card — fine, but there is no fallback if navigation is blocked (e.g. slug missing), leaving a dead-end "You're in!" card.

**World-class targets**
- Throttled, non-enumerating acceptance with a clear "too many attempts" state.
- Safe-redirect-helper-backed continuity across sign in / sign up → invite.
- Consistent skeleton container shared by all transient states (zero layout shift).
- Focus moved to the active card heading on every branch change.

---

## 2. Performance & Speed

- The page is light; the only network cost is the single accept mutation. Keep it that way — do not add eager data fetching before the user is known.
- Ensure the accept server function and its dependencies are **not pulled into the initial marketing/storefront bundle**; this is an authenticated, on-demand flow.
- Avoid invalidating the entire query cache on success (currently a broad invalidation) — scope invalidation to tenant-membership and tenant-list keys so unrelated cached data is preserved.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Server-side validation is authoritative**: token format, expiry, revocation, and email match must all be enforced in the server function (they are) — the client branches are presentation only.
- **Add rate limiting** at the edge for the accept endpoint, keyed by IP and/or token prefix, to defeat token guessing. Must use an edge-safe store (no Node-only deps).
- **SSR/prerender safety**: the accept call is auth-gated and must only run client-side after session hydration. Confirm it is never invoked from a route loader (which would 401 during prerender). It currently fires from an effect — keep it there.
- **Token handling**: tokens should be compared via hashed lookup server-side (never logged), and acceptance should be idempotent so a retried request on the same token returns "already accepted" rather than erroring.
- Membership writes must respect RLS / security-definer role checks so a user cannot escalate their own role via a crafted token.

---

## 4. Actionable Steps (production checklist)

1. Add edge-safe rate limiting to the accept endpoint (IP + token-prefix keyed) with a dedicated "too many attempts" UI state.
2. Route all sign in / sign up return paths through the shared safe-redirect helper instead of hand-built query strings.
3. Unify all transient and result states into one shared card-sized container to eliminate layout shift.
4. Move focus to the active card heading on every branch change; add an ARIA live region for status updates.
5. Narrow the post-success cache invalidation to tenant-membership and tenant-list keys.
6. Add a fallback action on the success card if navigation cannot resolve the destination slug.
7. Confirm acceptance is idempotent server-side and that tokens are matched via hashed lookup and never logged.
8. Verify the accept flow is client-only (never in a loader) so SSR/prerender never triggers an unauthorized call.

---

## Status

- [x] 1. Edge-safe rate limiting added on the accept endpoint (per-IP 10/60s + per-token-prefix 5/60s) backed by `public.invite_accept_attempts`. Dedicated `rate_limited` UI branch with retry CTA.
- [x] 2. Sign in / sign up return paths routed through the shared `safeRedirect` helper via `buildSafeReturnPath()`.
- [x] 3. All transient and result states unified inside a single `<InviteCard>` shell (fixed `min-h-[260px]`) — zero layout shift between phases.
- [x] 4. Focus moved to the active card heading on every branch swap (`headingRef.focus()` keyed on `branchKey`); shell exposes `role="status"` + `aria-live="polite"`.
- [x] 5. Post-success cache invalidation narrowed to `tenant-members`, `tenant-list`, `dashboard` query keys.
- [x] 6. Success card renders a fallback "Go to dashboard" CTA when `tenantSlug` is missing — no more dead-end card.
- [x] 7. Server-side hashed-token lookup confirmed (`hashInviteToken` only); raw tokens never logged. Acceptance is idempotent (`already_accepted` branch + member existence check before insert).
- [x] 8. Accept call remains client-only inside a `useEffect` — no `loader`, no `beforeLoad` data fetch — so SSR/prerender never invokes the auth-gated server fn.
