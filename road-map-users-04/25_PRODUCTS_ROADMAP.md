# Screen 25 — Products (Tenant Admin Catalog)

Stack: Supabase (DB/Auth/Storage) + Cloudflare Pages (Workers/Edge). Phase 04, screen 25 of 33. Cross-cutting theme: every write here mutates what the public storefront (Screens 12–14) renders, so storefront edge-cache invalidation and RLS-by-membership are non-negotiable.

## UX & Core Features

The Products screen is the single most-used tenant admin surface. It lists all products for the active tenant, supports search/filter/sort, bulk actions, single-product create/edit with variants and gallery, and a CSV bulk-import path. Every interactive element below must render as a trackable checkbox.

- [ ] Header with store name, "New product" primary CTA, "Import CSV" secondary CTA, "Export CSV" tertiary CTA
- [ ] Search input (debounced 300ms, server-side query, min 2 chars)
- [ ] Filter chips: status (draft/published/archived), category, has-stock, price range
- [ ] Sort dropdown: created desc (default), updated desc, price asc/desc, name asc, stock asc
- [ ] Bulk-select checkbox column with sticky "N selected" action bar (publish, unpublish, archive, delete)
- [ ] Row thumbnail with lazy-loaded image (proper `width`/`height` to avoid CLS)
- [ ] Inline status badge (draft/published/archived/out-of-stock)
- [ ] Row-level "Edit" / "Duplicate" / "Delete" overflow menu
- [ ] Empty state distinguishing "no products yet" (CTA to create or import) vs "no matches" (CTA to clear filters)
- [ ] Loading skeleton matching final row geometry (no layout shift on resolve)
- [ ] Error state with retry that re-runs the query (not just clears the boundary)
- [ ] Pagination control (cursor-based) with page size selector
- [ ] Product editor drawer/page with tabs: Details, Variants, Gallery, SEO, Inventory
- [ ] Variant editor row with SKU, price, compare-at-price, stock, options matrix
- [ ] Gallery uploader with drag-reorder, primary-image selector, alt-text input per image
- [ ] Image upload progress bar with cancel and per-file error states
- [ ] CSV import dialog: file picker, column-mapping preview, dry-run summary, commit button
- [ ] CSV import progress with per-row error report and downloadable error CSV
- [ ] Delete confirmation modal with typed-confirmation when product has historical orders
- [ ] Save toast on success; inline field errors on validation failure; non-blocking warning toast on edge-cache purge failure

## Performance & Speed

List query MUST be a single server function returning a typed page DTO (cursor pagination, NOT offset) so deep pages stay cheap. Thumbnails served via Supabase Storage transformations with explicit width/height to avoid CLS. The editor lazy-loads the Variants and Gallery tabs (route-level code-split) so the initial drawer paints fast. CSV import is stream-parsed on the server (no full-file buffer in Worker memory). Bulk actions batch through a single transactional server fn rather than N round-trips. The list query is keyed `["tenant-products", tenantId, filters, cursor]` with short stale time; mutations invalidate that key plus the parent KPIs.

## Backend & Cloudflare/Supabase Compliance

All reads/writes go through `createServerFn` protected by `requireSupabaseAuth` and a tenant-membership check (via `has_role`). RLS on `products` scopes by membership — never by a client-provided tenant id. Image uploads use short-lived signed upload URLs minted by a server fn; the client never holds service-role credentials. Server-side MIME sniffing rejects spoofed extensions. Variant SKU uniqueness enforced by a partial unique index per tenant. Soft-delete only when the product is referenced by any order (preserve order history); hard-delete allowed otherwise. Every create/update/delete calls a shared `invalidateStorefront(tenantId, { scope: "catalog" | "product", id })` helper that purges the edge-cached storefront catalog DTO and per-product DTO. No Node-only deps (no `sharp`, no `node-gyp` packages) — image resizing relies on Supabase Storage transforms. Audit log entry on every write with before/after diff.

## Actionable Steps

1. - [ ] Define typed `ProductListDTO` and `ProductDetailDTO` shapes shared by the list and editor server functions
2. - [ ] Implement cursor-paginated list server fn with server-side search/filter/sort and membership-scoped RLS
3. - [ ] Add partial unique index on `(tenant_id, sku)` for variants and on `(tenant_id, slug)` for products
4. - [ ] Implement signed-upload-URL server fn for product images with server-side MIME sniffing and size cap
5. - [ ] Implement create/update/delete server fns with atomic variant + gallery writes inside a single transaction
6. - [ ] Implement soft-delete branch when product is referenced by any order; hard-delete otherwise
7. - [ ] Implement bulk-action server fn (publish/unpublish/archive/delete) transactional and rate-limited
8. - [ ] Build shared `invalidateStorefront(tenantId, scope)` helper and call it from every write
9. - [ ] Wire TanStack Query invalidation for `["tenant-products"]`, `["store-overview", tenantId]`, `["my-tenants-stats"]` on every mutation
10. - [ ] Implement streaming CSV import server fn (no full-file buffer) with per-row validation and downloadable error report
11. - [ ] Implement streaming CSV export server fn respecting RLS and active filters
12. - [ ] Add SEO fields (slug, meta title, meta description) with per-tenant uniqueness validation server-side
13. - [ ] Add inventory-tracking toggle and low-stock threshold per variant
14. - [ ] Add price-history audit table and write entry on every price change
15. - [ ] Write audit log entry (actor, tenant, action, diff, IP, UA) for every create/update/delete/bulk action
16. - [ ] Add error boundary on the route with retry that calls `router.invalidate()` and `reset()`
17. - [ ] Add skeletons matching final row geometry to prevent CLS
18. - [ ] Verify no Node-only deps imported in the products module (audit `sharp`, `canvas`, `child_process`)
19. - [ ] Add e2e test: create → edit → publish → verify storefront cache shows new data within one revalidation cycle
20. - [ ] Add e2e test: member of tenant A cannot read or mutate products of tenant B