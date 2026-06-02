# 13 — Admin Tenant Detail · Billing Tab Roadmap

Tenant-scoped billing ledger, invoices, refunds, credits, and subscription overrides.

## UX & Core Features
- [ ] Append-only ledger table with running balance
- [ ] Invoices panel: list, status, download PDF
- [ ] Refund / credit dialog with amount, currency, reason
- [ ] Subscription-override card: pause, extend, change plan-version
- [ ] Confirmation dialog before every refund / override
- [ ] Re-auth gate before refund or override commit
- [ ] Diff preview before commit
- [ ] Toast on success; audit-trail panel showing all prior actions

## Performance & Speed
- Ledger paginated (cursor) and capped server-side.
- Invoice PDF generation streamed, not buffered (Worker memory).
- Override mutations idempotent via client-supplied idempotency keys.

## Backend & Cloudflare/Supabase Compliance
- Ledger is append-only — no UPDATE/DELETE policies for any role.
- Refunds/credits use idempotency keys `tenant_id + action + nonce` so double-click cannot double-refund.
- Mutations gated by `requireSupabaseAuth` + admin role + server-side recent-login re-auth.
- Every action writes an audit row with full diff and reason.
- Subscription override repoints to a specific `plan_version_id` — never edits the plan row.
- Invoice PDF rendered server-side via edge-safe template (no headless browser).
- Resend notification fires on refund/credit/override with deterministic idempotency key.

## Actionable Steps
- [ ] 1. Confirm ledger table has no UPDATE/DELETE policies for any non-service role
- [ ] 2. Add client-supplied idempotency keys to refund/credit/override mutations
- [ ] 3. Enforce server-side recent-login re-auth for refund and override
- [ ] 4. Repoint subscription overrides to `plan_version_id` (depends on screen 10)
- [ ] 5. Switch invoice PDF rendering to streaming, edge-safe template
- [ ] 6. Add audit rows + Resend notices to every mutation with idempotency keys
- [ ] 7. Add tests: "double-click Refund → one ledger row, one Resend email"
- [ ] 8. Add tests: "override change_plan → existing renewals use new version on next cycle only"