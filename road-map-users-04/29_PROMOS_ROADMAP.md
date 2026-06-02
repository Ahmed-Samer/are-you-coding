# Screen 29 — Promos (Discount Codes)

Stack: Supabase (DB/Auth) + Cloudflare Pages (Workers/Edge). Phase 04, screen 29 of 33. Concurrency-sensitive: usage counters must be incremented inside the checkout transaction to prevent over-redemption.

## UX & Core Features

- [ ] Header with "New promo" CTA and "Bulk generate" secondary CTA
- [ ] Filter chips: active / scheduled / expired / disabled
- [ ] Sort: created desc, expires asc, usage desc
- [ ] Table columns: code, type (percent/fixed/free-shipping), scope (cart/product/category), usage / cap, window, status
- [ ] Row actions: edit, disable, duplicate, copy code to clipboard
- [ ] Editor form: code (uppercase normalized), type, value, scope target picker, min cart amount, per-customer cap, total cap, start/end datetime (tenant timezone), stacking rule
- [ ] Inline uniqueness check on code (case-insensitive) on blur
- [ ] Date pickers render in tenant timezone with timezone label visible
- [ ] Bulk-generate dialog: prefix, count, value, expiry — runs as background job with progress
- [ ] Empty state: "no promos yet" vs "no matches"
- [ ] Loading skeleton matching row geometry
- [ ] Error state with retry
- [ ] Toasts on save / disable / generate; inline validation errors

## Performance & Speed

Single server fn for list with server-side filter/sort and cursor pagination. Bulk generate runs as a background job (server fn that enqueues + a cron consumer or a single long-running server fn with progress polling) — never block the UI thread for thousands of codes. Active-promos lookup for the storefront cart drawer is cached at the edge with short TTL and version-bumped on every write.

## Backend & Cloudflare/Supabase Compliance

RLS on `promos` and `promo_redemptions` scopes by tenant membership. Code uniqueness per tenant enforced by case-insensitive partial unique index (`lower(code), tenant_id`). Overlap and stacking rules validated server-side on create/update. **Critical concurrency rule**: usage counter is incremented atomically inside the order-creation transaction (`UPDATE promos SET usage_count = usage_count + 1 WHERE id = $1 AND usage_count < total_cap RETURNING ...`); if the conditional update returns zero rows, the checkout aborts with "promo exhausted". Per-customer cap enforced via a `(promo_id, customer_id)` partial unique index on `promo_redemptions`. Expiry comparison uses the tenant's configured timezone (Screen 32), not server UTC. Active-promos cache key includes a tenant `promo_version` integer that is bumped on every write. Audit log entry on create/update/disable/extend. Edge-safe — no Node-only deps.

## Actionable Steps

1. - [ ] Add case-insensitive partial unique index on `(tenant_id, lower(code))`
2. - [ ] Add partial unique index on `promo_redemptions (promo_id, customer_id)` for per-customer cap
3. - [ ] Implement promos list server fn with cursor pagination and filters
4. - [ ] Implement create/update/disable server fns with server-side overlap and stacking validation
5. - [ ] Implement atomic-increment usage counter inside the order-creation transaction
6. - [ ] Implement bulk-generate background job with progress polling
7. - [ ] Store and compare expiry windows in the tenant's configured timezone
8. - [ ] Add `promo_version` integer on tenant settings; bump on every promo write
9. - [ ] Update storefront active-promos cache key to include `promo_version`
10. - [ ] Wire TanStack Query invalidation for `["tenant-promos"]` on every write
11. - [ ] Call `invalidateStorefront(tenantId, { scope: "promos" })` on every write
12. - [ ] Add audit log entry on create/update/disable/extend/bulk-generate
13. - [ ] Add error boundary with retry
14. - [ ] Add skeleton matching row geometry
15. - [ ] Add e2e test: concurrent checkouts cannot exceed `total_cap`
16. - [ ] Add e2e test: per-customer cap enforced across multiple sessions
17. - [ ] Add e2e test: expiry honored in tenant timezone, not UTC
18. - [ ] Add e2e test: cross-tenant promo read denied by RLS