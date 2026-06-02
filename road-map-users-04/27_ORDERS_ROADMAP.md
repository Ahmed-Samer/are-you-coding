# Screen 27 — Orders (Tenant Admin Order Log)

Stack: Supabase (DB/Auth) + Cloudflare Pages (Workers/Edge). Phase 04, screen 27 of 33. Read-mostly with sensitive PII; status transitions, refunds, and exports must be server-authoritative and role-gated.

## UX & Core Features

- [ ] Header with date-range picker, status filter, channel filter, search by order id / customer phone / email
- [ ] KPI row: orders count, revenue, AOV, refund rate (within selected range)
- [ ] Orders table with sortable columns: created, customer, total, status, channel, attribution source
- [ ] PII columns (phone, full address) masked by default; "Reveal" button gated by role
- [ ] Row click opens order detail drawer with line items, customer block, address block, timeline
- [ ] Status transition control showing only legal next states from the current state
- [ ] Refund flow: partial-amount input, reason dropdown, idempotency-protected submit
- [ ] Contact customer button (WhatsApp deep link / email mailto) with audit log entry
- [ ] Bulk-select with bulk status change and bulk CSV export of selected
- [ ] Export CSV button (streams server-side, respects current filters and RLS)
- [ ] Empty state: "no orders yet" vs "no matches"
- [ ] Loading skeleton matching row geometry
- [ ] Error state with retry
- [ ] Toasts on status change / refund / export; inline errors on illegal transitions

## Performance & Speed

Single server fn returns a typed page DTO with cursor pagination. Filters and sort are server-side. KPI strip is a separate server fn keyed on the same date range with a short TTL so it can render before the table resolves. CSV export streams response chunks; no full result-set buffer in Worker memory. The detail drawer lazy-loads timeline and refund history.

## Backend & Cloudflare/Supabase Compliance

RLS on `orders` and `order_items` scopes by tenant membership. Status machine is server-enforced — the server fn validates the requested transition against a constant transition table and rejects illegal moves regardless of client request. Refund flow uses an idempotency key derived from (order_id, attempt_id) and writes the ledger entry atomically inside a single transaction. PII columns gated by a dedicated role (e.g. `orders:read_pii`); masked projection used for users without that role. CSV export streams via a server route or server fn returning a `ReadableStream`; no Node-only CSV libraries. Abandoned-cart-converted orders back-reference the source `abandoned_carts.id` for recovery attribution (feeds Screen 28). Audit log entry on every status change, refund, PII reveal, and export.

## Actionable Steps

1. - [ ] Define `OrderListDTO`, `OrderDetailDTO`, and `OrderKpiDTO` shapes
2. - [ ] Implement cursor-paginated orders list server fn with date/status/channel filters and search
3. - [ ] Implement KPI server fn keyed on date range with short edge TTL
4. - [ ] Implement server-enforced status-transition table; reject illegal moves
5. - [ ] Implement refund server fn with idempotency key and atomic ledger write
6. - [ ] Add `orders:read_pii` role and gate PII columns server-side via projection
7. - [ ] Implement streaming CSV export server fn / route respecting RLS and filters
8. - [ ] Add `source_abandoned_cart_id` column on `orders` for recovery attribution
9. - [ ] Wire TanStack Query invalidation for `["tenant-orders"]`, KPI, and `["recovery-stats"]` on status change
10. - [ ] Add audit log entry on status change, refund, PII reveal, contact-customer, export
11. - [ ] Add error boundary with retry
12. - [ ] Add skeleton matching row geometry
13. - [ ] Add e2e test: illegal status transition rejected server-side
14. - [ ] Add e2e test: user without PII role sees masked phone/address
15. - [ ] Add e2e test: duplicate refund submit with same idempotency key is no-op
16. - [ ] Add e2e test: cross-tenant order read denied by RLS