# Store Overview — Production Roadmap

> Phase 03: Subscription Checkout & Tenant Dashboard Entry · Screen 24 of 24
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

First per-store screen after the user clicks into a tenant from the dashboard list. Surfaces KPIs (orders today, revenue, top products, recent activity) and is the launch pad into Products, Categories, Orders, Recovery, Promos, Domains, Team, and Settings. Must render meaningfully for stores in `pending`/`pending_review` too — not just `active`.

---

## 1. UX & Core Features

**Current state**
- Header with store name, status badge, and shortcut links into the per-store admin pages.
- KPI cards (orders, revenue, etc.) and a recent-activity feed.

**Interactive elements & states to track**
- [ ] Store name + status badge
- [ ] KPI cards (Orders today, Revenue 7d, AOV, Conversion or equivalent)
- [ ] Date-range selector (Today / 7d / 30d / Custom)
- [ ] Recent-orders list with click-through to Orders
- [ ] Quick links into Products, Categories, Orders, Recovery, Promos, Domains, Team, Settings
- [ ] "View live storefront" link (resolves to published URL)
- [ ] Loading skeleton for KPI cards and activity feed
- [ ] Pre-active state: "Your store will go live once payment is verified" panel instead of zero-value KPI charts
- [ ] Empty state when the store is active but has no orders yet (onboarding-style call to action: add products, share link)
- [ ] Error state when KPI server function fails
- [ ] Forbidden state when the user is no longer a member of the tenant

**Gaps & risks**
- KPI data is fetched via multiple round-trips; should be a single server function returning a typed shape.
- No date-range selector — KPIs are fixed windows.
- For stores still in `pending`/`pending_review`, charts render zero-value graphs that look like a broken/abandoned store; should show a clear "going live soon" panel instead.
- Currency is hardcoded in some places; should be derived from store settings.
- "View live storefront" link must resolve to the real published URL (custom domain → subdomain), not the dev-only override.
- RLS scoping must use the membership/`has_role` pattern; never trust a client-supplied tenant id alone.

---

## 2. Performance & Speed

- Collapse KPI reads into one server function returning a typed DTO (orders today, revenue window, AOV, top N products, recent activity).
- Cache at the edge with a short TTL keyed on `(tenant_id, user_id, window)`; invalidate on order create/update.
- Reserve KPI card and chart dimensions to prevent CLS as data arrives.
- Recent-activity feed should be windowed/paginated (don't fetch the entire orders table).
- `refetchOnWindowFocus` for KPIs so the operator sees fresh numbers after switching back to the tab.

---

## 3. Backend & Cloudflare/Supabase Compliance

- All reads via `requireSupabaseAuth`; RLS on `orders`, `products`, `tenants` enforces tenant membership via the `has_role`/`tenant_members` pattern.
- Never filter by `tenant_id` client-side and trust it — RLS is the authoritative gate.
- A single KPI server function aggregates server-side (one query plan, not N round-trips).
- Edge-safe: no Node-only deps; aggregations done in SQL, not in Worker memory for large tables.
- Cross-cutting Phase-03 theme: this screen MUST render correctly for non-active tenants (the `pending` and `pending_review` paths) so the dashboard render-bug fix work flows through here too.
- Audit log entries are read-only here; no admin actions on this screen.

---

## 4. Actionable Steps (production checklist)

1. - [ ] Collapse KPI reads into a single `requireSupabaseAuth` server function returning a typed DTO.
2. - [ ] Add a date-range selector (Today / 7d / 30d / Custom) wired into the KPI server function.
3. - [ ] Render a "Your store will go live once payment is verified" panel for `pending`/`pending_review` stores instead of zero-value charts.
4. - [ ] Derive currency formatting from store settings, not hardcoded.
5. - [ ] Replace the dev-only Preview link with the published storefront URL (custom domain → subdomain fallback).
6. - [ ] Verify RLS on `orders`, `products`, `tenants` enforces membership via the `has_role`/`tenant_members` pattern.
7. - [ ] Cache KPI responses at the edge with short TTL keyed on `(tenant_id, user_id, window)`; invalidate on order create/update.
8. - [ ] Reserve KPI card and chart dimensions to prevent CLS.
9. - [ ] Window/paginate the recent-activity feed.
10. - [ ] Enable `refetchOnWindowFocus` for KPI queries.
11. - [ ] Add explicit empty / pre-active / error / forbidden states with copy-tailored CTAs.
12. - [ ] Confirm all aggregations are SQL-side and the path is Worker-compatible.