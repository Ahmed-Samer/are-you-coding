# Onboarding — Plan — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 17 of 18 (Wizard step 3 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)
> Status: **shipped** ✅

Step 3 of the wizard: pick a subscription plan with a monthly/quarterly billing toggle. Plans are loaded from the shared `listPlans` server function (5-min edge cache) and feed directly into store creation and the downstream checkout wizard.

---

## 1. UX & Core Features

**Shipped**
- [x] Plans fetched once via `listPlans` and cached under `['plans']` with `staleTime: 5 min`; reused across steps without refetching.
- [x] Monthly/Quarterly toggle (aligned with the canonical plans catalog and the Marketing Pricing page — replaces the legacy `yearly` label).
- [x] Interval switch is synchronous and atomic — `planSlug` is preserved if it still matches the new interval, cleared otherwise, so Next never flashes enabled with a stale selection.
- [x] `?plan=` deep-link from Marketing Pricing pre-selects the plan AND auto-aligns the interval to the plan row AND jumps to the plan step when basics are already complete.
- [x] Error + retry fallback when plan fetch fails (distinct from loading and empty-interval states), with `role="alert"` and a Retry button.
- [x] Loading and empty-for-interval states have `role="status"` + `aria-live="polite"`.

## 2. Performance & Speed

- [x] Plans query `staleTime: 5 * 60_000` + `gcTime: 30 * 60_000` — step navigation never refetches.
- [x] Module-level `_plansCache` in `listPlans` (5-min TTL) keeps repeat invocations on the same edge isolate near-instant.
- [x] Filtered plans memoized via `useMemo` keyed on `[plans, draft.interval]`.

## 3. Backend & Cloudflare/Supabase Compliance

- [x] Single Supabase source: `listPlans` server function exposes only public-safe columns (`id, slug, name, description, price_usd, currency, interval, features, highlight, sort_order`).
- [x] `pricing-static.ts` flagged as a future migration target so Pricing/Onboarding/Checkout converge on `listPlans`.
- [x] `createTenantAndSubscription` revalidates plan slug **and** interval server-side — tampered drafts with a mismatched interval are rejected with `"Plan and billing period do not match"`.
- [x] `GRANT SELECT ON public.plans TO anon, authenticated` appended to `PENDING_SQL_COMMANDS.sql` (idempotent).
- [x] All reads edge-safe — no Node-only deps introduced.

## 4. Actionable Steps (production checklist)

- [x] Add an error + retry fallback for plan-load failure (distinct from loading and empty-interval states).
- [x] Source plans from a single shared Supabase `plans` table used by pricing, onboarding, and checkout.
- [x] Format price/currency from billing configuration instead of hardcoded USD strings (`src/lib/format-price.ts` → `formatPlanPrice(plan)` with `Intl.NumberFormat`).
- [x] Revalidate plan slug + interval server-side at create time (guard tampered drafts).
- [x] Edge-cache the plans read and share it across pricing/onboarding/checkout.
- [x] Ensure the interval-toggle auto-clear can't transiently flash a disabled Next (`effectivePlan` + synchronous `switchInterval`).
- [x] Expose only public-safe plan fields under RLS (SELECT projection in `listPlans` is the gate; GRANT added).
- [x] Add focus management on step entry (`planRef` lands on the first plan tile inside the `radiogroup`).
- [x] Bump draft key to `coreweb:onboarding:draft:v3` to discard legacy `yearly` drafts cleanly.
- [x] Tests updated to assert interval is sent in payload and v3 key is cleared on success.
