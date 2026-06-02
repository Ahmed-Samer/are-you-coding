# 04 — Admin Billing Dunning Roadmap

Queue of subscriptions with failed payments or imminent period-end. Admins triage, retry, and contact tenants to reduce churn.

## UX & Core Features
- [ ] Sortable table: tenant, plan, next-attempt, attempts so far, status
- [ ] Row actions: "Retry now", "Send reminder", "Mark uncollectible"
- [ ] Confirmation dialog before any state-changing action
- [ ] Status pills (`grace`, `past_due`, `uncollectible`) with consistent colors
- [ ] Bulk-select with bulk "Send reminder"
- [ ] Empty state when the dunning queue is clear
- [ ] Toast on success/failure of each action

## Performance & Speed
- Server-side pagination + filter; the table never loads full ledger history.
- Retry triggers are idempotent — repeated clicks within the dedupe window are no-ops.
- Reminder emails batched per tick to respect Resend rate limits.

## Backend & Cloudflare/Supabase Compliance
- All mutations gated by `requireSupabaseAuth` + admin role; writes via `supabaseAdmin`.
- Status state machine (`active → grace → past_due → uncollectible → recovered`) enforced server-side; UI cannot send arbitrary transitions.
- Resend calls use deterministic idempotency keys (`tenant_id + attempt_n + template`) to prevent duplicate sends on retry.
- Every action writes an audit row before returning success.
- Edge-safe Resend client (fetch-based, no Node SDK that breaks under Workers).

## Actionable Steps
- [ ] 1. Document the dunning state machine and enforce transitions in a server fn
- [ ] 2. Add idempotency keys to every Resend dispatch
- [ ] 3. Make "Retry now" a server fn that re-attempts the underlying provider call with audit logging
- [ ] 4. Implement bulk-reminder as a single server fn that batches Resend calls
- [ ] 5. Add server-side pagination + filter parameters
- [ ] 6. Confirm the route never loads full billing ledger client-side
- [ ] 7. Add tests for "double-click retry produces one provider call, one audit row, one email"
- [ ] 8. Add a metric for dunning-recovery rate exported to admin analytics