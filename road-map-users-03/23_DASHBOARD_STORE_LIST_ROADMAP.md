# Dashboard — Store List — Production Roadmap

> Phase 03: Subscription Checkout & Tenant Dashboard Entry · Screen 23 of 24
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The signed-in user's home base. Lists every tenant the user owns or belongs to, with per-store stats, aggregate analytics, a "resume onboarding" affordance, and entry points to manage each store. **This screen carries the Phase-03 critical bug** — newly created stores with `pending`/`pending_review` status can fail to appear here. The deep-dive in §3 documents the four layers and the fix surface that lands across Screens 21, 22, and 23.

---

## 1. UX & Core Features

**Current state**
- Header with "Create a new store" CTA.
- "Resume your setup" banner when an onboarding draft is present in localStorage.
- Analytics overview row (Stores, Orders today, Revenue 7d) — currency hardcoded to EGP.
- Search input appears when there are more than 3 stores.
- Per-store card with status badge, slug, plan, per-store stats (for active stores), and action buttons that branch by status.
- Cancel-pending-checkout dialog.

**Interactive elements & states to track**
- [ ] "Create a new store" CTA
- [ ] "Resume your setup" banner (with Dismiss and Resume actions) when a draft exists
- [ ] Analytics overview cards (Stores / Orders today / Revenue 7d)
- [ ] Search input (visible only when >3 stores)
- [ ] Per-store status badge: `active`, `pending`, `pending_payment`, `pending_review` (Awaiting approval), `cancelled`
- [ ] "Complete payment" CTA for `pending_payment`
- [ ] "Submitted — under review" CTA for `pending_review`
- [ ] "Manage (draft)" CTA for non-active stores
- [ ] "Manage" CTA for active stores
- [ ] "Preview" link
- [ ] Cancel-pending-checkout icon button + confirmation dialog
- [ ] Loading skeleton (cards + stat row)
- [ ] Empty state: no stores ever created
- [ ] Empty state: search returned no results (must NOT be confused with "no stores")
- [ ] Error state when `getMyTenants` fails

**Gaps & risks**
- The "where is my new store?" failure mode — see §3 deep-dive.
- Analytics overview hardcodes EGP currency; multi-currency tenants will display wrong totals.
- "Preview" link uses a dev-only `?store=` query override and won't reach the published storefront under custom domains/subdomains in production.
- No empty-state differentiation between "never created a store" and "all stores cancelled".
- No status filter / sort affordance for power users with many stores.
- Pagination missing — large tenants lists render everything at once.
- Skeleton parity gap: stat cards render later than tenant cards when stats are slower than the tenant list.

---

## 2. Performance & Speed

- Two server functions (`getMyTenants`, `getMyTenantsWithStats`) fire in parallel — good. Keep their query keys distinct so stats don't block tenants.
- Skeleton parity: render the stat-card skeleton while either query is loading.
- Reserve layout for the analytics row, the search bar, and each card so async loads don't cause CLS.
- For users with many stores, paginate or virtualize the list (sub-200ms time-to-interactive target).
- Cache headers on both server functions MUST be `Cache-Control: private, no-store`; never wrap user-scoped reads in an edge/shared cache.
- On focus/visibility regain, refetch both queries (TanStack's `refetchOnWindowFocus`) so a store approved in another tab appears immediately.

---

## 3. Backend & Cloudflare/Supabase Compliance — DEEP-DIVE: pending stores not rendering

Newly created stores with `pending`, `pending_payment`, or `pending_review` status can fail to appear on this dashboard. The failure is multi-layered; ship the audit + fixes for every layer or the bug will keep regressing.

**Layer 1 — TanStack Query cache staleness.**
The dashboard reads tenants from `["my-tenants"]` and aggregate stats from `["my-tenants-stats"]`. Every write-side path that creates or transitions a tenant/subscription must invalidate BOTH keys. Onboarding-confirm already invalidates; verify the checkout flow (Screen 21 proof upload, Screen 22 status observations, cancel-pending mutation) invalidates the same keys on settle. A single missed invalidation produces the "I just created it, where is it?" experience.

**Layer 2 — Server-function response caching.**
`getMyTenants` and `getMyTenantsWithStats` are user-scoped reads. Confirm: (a) responses set `Cache-Control: private, no-store`; (b) no shared/edge cache wrapper is applied; (c) no CDN rule treats the server-function path as cacheable. A shared cache keyed only on URL will serve a previous user's (or a previous moment's) response.

**Layer 3 — RLS / server query filters.**
Audit both the RLS policy on `tenants` and the `.select()` chain:
- The RLS SELECT policy on `tenants` must grant the owner/member visibility with **no `status` predicate**. Pattern: `using (exists (select 1 from tenant_members where user_id = auth.uid() and tenant_id = tenants.id))`. Any `and status = 'active'` clause hides pre-active rows from their own owner.
- The server query must not silently filter `status = 'active'`. Pending rows must come back.
- The subscriptions join must be a LEFT join so a tenant whose subscription row hasn't been written yet still surfaces.
- The same audit applies to the stats server function — it must return a zero-stats record for non-active tenants rather than dropping them.

**Layer 4 — UI filtering / layout.**
The dashboard renders branches for `pending_review` (Awaiting approval) and `pending_payment` (Complete payment) — confirm those branches are reachable and that the rendered list iterates `tenants` (or `filtered` when search is active) without an extra `.filter(t => t.status === 'active')`. The empty-state copy must trigger on `tenants.length === 0`, NOT on `filtered.length === 0` (which hides pending stores behind a stale search query).

**Other backend rules**
- All reads via `requireSupabaseAuth`; never `supabaseAdmin` from a user-facing route.
- Edge-safe (Worker-compatible); no Node-only deps.
- The "Preview" link must resolve to the published storefront URL (custom domain → subdomain fallback), not the dev-only `?store=` override.

---

## 4. Actionable Steps (production checklist)

1. - [ ] Audit the `tenants` RLS SELECT policy to remove any `status` predicate — membership alone grants visibility.
2. - [ ] Audit `getMyTenants` and `getMyTenantsWithStats` to remove any implicit `status` filter and ensure LEFT JOIN to subscriptions.
3. - [ ] Ensure both server functions return `Cache-Control: private, no-store`; never wrap in a shared/edge cache.
4. - [ ] Verify every write-side path (proof upload, status change, cancel-pending, onboarding-confirm) invalidates `["my-tenants"]` and `["my-tenants-stats"]` on settle.
5. - [ ] Confirm the dashboard render path does not filter out non-active tenants by search or by an accidental `.filter(status === 'active')`.
6. - [ ] Distinguish empty-state "no stores" from "search returned no results" with different copy and CTAs.
7. - [ ] Replace the EGP-hardcoded aggregate currency with per-currency totals (or a clearly-labeled primary currency).
8. - [ ] Replace the dev-only `?store=` Preview link with the published storefront URL (custom domain → subdomain fallback).
9. - [ ] Add status filter + sort affordance; add pagination/virtualization for large tenant counts.
10. - [ ] Achieve skeleton parity between the stat row and the tenant cards.
11. - [ ] Enable `refetchOnWindowFocus` so an approval in another tab appears here without a manual refresh.
12. - [ ] Add typed tests covering: pending tenant visible, pending_review tenant visible, search hides nothing pending, cancel-pending invalidates queries.