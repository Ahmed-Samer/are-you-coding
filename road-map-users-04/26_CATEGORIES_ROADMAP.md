# Screen 26 — Categories (Tenant Admin Taxonomy)

Stack: Supabase (DB/Auth) + Cloudflare Pages (Workers/Edge). Phase 04, screen 26 of 33. Categories feed the storefront navigation and the product editor, so every write here must purge the storefront edge cache and respect membership-scoped RLS.

## UX & Core Features

Tree/list of categories per tenant, with display order, slug, parent, and a storefront-visibility toggle.

- [ ] Header with "New category" CTA and "Reorder mode" toggle
- [ ] Tree view with drag-handles, expand/collapse, and depth indicators
- [ ] Inline rename with optimistic update and rollback on server error
- [ ] "Hide from storefront" toggle distinct from delete (preserves products + URL history)
- [ ] Row badge showing product count and child-category count
- [ ] Parent selector in editor with cycle prevention (cannot pick self or descendant)
- [ ] Slug input with auto-derive from name, manual override, and uniqueness check on blur
- [ ] Localized name fields (per supported locale) collapsed by default
- [ ] Delete confirmation modal with two options: reassign products to parent / set to null (uncategorized)
- [ ] Empty state: "no categories yet" (CTA) vs "all categories hidden" (different copy)
- [ ] Loading skeleton matching tree row geometry
- [ ] Error state with retry
- [ ] Save toast; inline validation errors; warning toast on storefront-cache purge failure

## Performance & Speed

Categories list is small (typically < 200 rows) — fetch the full tree in one server call, render client-side. Reorder persists via a single server fn that accepts the full new ordering array (not N row-by-row updates). The tree component memoizes children render per node to avoid re-render storms during drag. Slug uniqueness check debounced and server-validated. Query key `["tenant-categories", tenantId]` invalidated on every write plus the storefront catalog cache.

## Backend & Cloudflare/Supabase Compliance

RLS on `categories` scopes by tenant membership via `has_role`. Parent-child cycle prevention enforced server-side with a recursive check, not client-side. Slug uniqueness per tenant enforced by partial unique index; reserved-slug list (`cart`, `checkout`, `account`, `admin`, etc.) rejected server-side. Delete server fn runs in a single transaction: either reassigns `products.category_id` to the parent or nulls it out, then deletes the category. Every write calls `invalidateStorefront(tenantId, { scope: "catalog" })` and the per-category landing payload if cached. Edge-safe — no Node-only deps. Audit log entry on every write.

## Actionable Steps

1. - [ ] Define typed `CategoryTreeDTO` returned by a single list server fn
2. - [ ] Add partial unique index on `(tenant_id, slug)` and a reserved-slug CHECK or trigger
3. - [ ] Implement create/update/delete server fns with membership-scoped RLS
4. - [ ] Implement reorder server fn accepting full ordering array, persisted in one transaction
5. - [ ] Implement server-side cycle-prevention check on parent change
6. - [ ] Implement delete server fn with reassign-or-null product branch inside a single transaction
7. - [ ] Wire `invalidateStorefront(tenantId, { scope: "catalog" })` to every write
8. - [ ] Wire TanStack Query invalidation for `["tenant-categories"]` on every mutation
9. - [ ] Add localized name columns (or JSON map) with per-locale validation
10. - [ ] Add "hide from storefront" boolean separate from delete
11. - [ ] Add audit log entry on every create/update/delete/reorder
12. - [ ] Add error boundary with retry
13. - [ ] Add skeleton matching tree row geometry
14. - [ ] Add e2e test: rename category → verify storefront nav updates within one revalidation cycle
15. - [ ] Add e2e test: cycle prevention rejects setting parent to self or descendant
16. - [ ] Add e2e test: cross-tenant access to categories is denied by RLS