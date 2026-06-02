# Checkout — Review — Production Roadmap

> Phase 03: Subscription Checkout & Tenant Dashboard Entry · Screen 19 of 24 (Wizard step 1 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

First step of the subscription checkout wizard. After onboarding creates the tenant + subscription, the user lands here to review the chosen plan, interval, currency, and total before being shown payment instructions. This screen is the seam between the (client-driven) onboarding draft and the (server-authoritative) billing state machine.

---

## 1. UX & Core Features

**Current state**
- Summary of the selected plan, interval, and amount owed before proceeding to bank instructions.
- Wizard stepper indicates progress (1 of 4) and a back affordance returns to the dashboard or onboarding context.

**Interactive elements & states to track**
- [x] Plan + interval summary card (name, price, currency, billing interval)
- [x] "Continue to payment instructions" primary CTA
- [x] "Back to dashboard" secondary CTA
- [x] Loading state while the subscription is re-fetched from the server
- [x] Empty/error state when the subscription id is missing, expired, or belongs to another user
- [x] State when the subscription has already advanced past `pending_payment` (auto-route to the correct step)
- [x] State when the underlying plan has been removed/disabled since onboarding
- [x] Currency/locale-aware price formatting

**Gaps & risks**
- Review currently trusts the handoff state from onboarding; it should re-fetch the subscription server-side so a refreshed/shared link still works.
- Plan/price drift: if the plans table changes between onboarding-confirm and review, the user can see a stale price.
- No guard against landing here with a subscription already in `pending_review`, `active`, or `cancelled` — should redirect to the correct wizard step automatically.
- Currency/locale formatting is hardcoded in places; should derive from the subscription's currency.
- Error path doesn't distinguish "not found" (404), "wrong owner" (403, RLS-denied), and generic failure — all surface as the same toast.

**World-class targets**
- Subscription state is read fresh on every mount; client handoff is a hint, never truth.
- Wizard auto-routes to the correct step based on the server's status enum (state-machine driven).
- Plan/price always reflects the live `plans` row at the moment of review (with a price-changed notice if it differs from onboarding).
- Distinct, copy-tailored error pages for not-found, forbidden, and transient failures.

---

## 2. Performance & Speed

- Review is a single read; keep it on one server function returning a typed DTO (subscription + joined plan + tenant slug) rather than multiple round-trips.
- Render-blocking work should be the single subscription fetch only; everything else (icons, copy, stepper) is static.
- Reserve layout for the price/CTA block so currency formatting or a price-changed notice does not cause CLS.
- Cache headers MUST be `Cache-Control: private, no-store` on this user-scoped read; never wrap in an edge/shared cache.

---

## 3. Backend & Cloudflare/Supabase Compliance

- Server function must enforce ownership via `requireSupabaseAuth` and RLS — never accept a subscription id from the client without verifying the caller is on the owning tenant's membership.
- Map RLS denial to a distinct error code so the UI can render a `403` page rather than a generic toast.
- The plan join must read from the canonical `plans` table used by Pricing/Onboarding/Checkout (single source of truth).
- Edge-safe: no Node-only deps; all reads via the Worker-compatible Supabase client.
- Subscription status transitions are server-authoritative; the UI never patches status from this screen.
- Cross-cutting Phase-03 theme: this screen is the first place to enforce **server-authoritative subscription state** before any payment UX is shown.

---

## 4. Actionable Steps (production checklist)

1. - [x] Re-fetch the subscription server-side on mount instead of trusting onboarding handoff state.
2. - [x] Auto-route to the correct wizard step based on the server's status enum (`pending_payment` → here, `pending_review` → 22, `active` → dashboard, `cancelled` → dashboard with toast).
3. - [x] Join the live `plans` row at read time and show a "price changed since onboarding" notice if it differs.
4. - [x] Differentiate error states: not-found (404), forbidden (RLS-denied, 403), transient failure (retryable).
5. - [x] Derive currency/locale formatting from the subscription's currency, not hardcoded.
6. - [x] Add a breadcrumb back to the onboarding plan step (not just the dashboard).
7. - [x] Set `Cache-Control: private, no-store` on the review server function; never wrap in a shared cache.
8. - [x] Verify RLS on `subscriptions` scopes SELECT to tenant membership (not status-filtered) so pre-active subs are visible.
9. - [x] Confirm the server function is edge-safe (Worker-compatible) and returns a serializable DTO only.
10. - [x] Add typed tests covering each routing/error branch (missing id, wrong owner, already-active, plan-deleted).