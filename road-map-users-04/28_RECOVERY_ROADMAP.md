# Screen 28 — WhatsApp Abandoned Cart Recovery

Stack: Supabase (DB/Auth) + Cloudflare Pages (Workers/Edge). Phase 04, screen 28 of 33. Highest-risk surface in this batch: a cron-driven send pipeline that touches customer PII, an external WhatsApp provider, and revenue-attribution data. Edge-safety, idempotency, and PII gating are non-negotiable.

## UX & Core Features

Three panels: stats cards (KPIs), settings panel (enable/disable, delay tier, template), abandoned carts table (per-cart status, attempts, last send, attribution).

- [ ] Enable/disable master toggle with confirmation when disabling (pending sends are cancelled)
- [ ] Delay tier radio group: 30 / 60 / 120 / 360 minutes (server-enforced)
- [ ] Message template editor with variable picker (`{customer_name}`, `{cart_total}`, `{store_name}`, `{recovery_url}`)
- [ ] Live preview rendering server-escaped variables against a sample cart
- [ ] "Send test message to my number" button (rate-limited, requires verified phone)
- [ ] Stats cards: recoverable carts, messages sent, messages delivered, recovered orders, recovered revenue (within window)
- [ ] Attribution window selector (24h / 7d / 30d) — server-enforced and matches cron logic
- [ ] Carts table: customer (masked phone unless role-gated), cart total, status, attempts, last send, attribution outcome
- [ ] Row action: "Resend now" (rate-limited, idempotent)
- [ ] Row action: "Mark opted-out" (also auto-applied when provider reports STOP)
- [ ] Empty state: "WhatsApp provider not configured" with link to Settings (Screen 32)
- [ ] Empty state: "no abandoned carts yet"
- [ ] Loading skeleton matching card and row geometry
- [ ] Error state with retry
- [ ] Reduced-motion respected on animated KPI counters
- [ ] Toasts on save / test send / resend; inline validation for template variables

## Performance & Speed

Stats query is a single server fn keyed `["recovery-stats", tenantId, window]` with short TTL. Cart table cursor-paginated server-side. Template preview rendered server-side (one server fn call) so the client never interpolates raw HTML. The cron route batches sends per-tick with provider-side concurrency limits, never per-cart fetch loops.

## Backend & Cloudflare/Supabase Compliance

The send pipeline runs in `/api/public/cron/abandoned-carts` (already scaffolded). Critical rules: HTTP-only client to the WhatsApp provider (NO Node-only SDK; no `child_process`); idempotency key per `(cart_id, attempt_number)` enforced by a partial unique index on `recovery_attempts`; per-tenant rate limit + provider-side rate limit; opt-out / STOP keyword handling persisted in `recovery_opt_outs` keyed by phone hash; delay tier enforced server-side using cart `updated_at` + tier; attribution computed by joining `orders.source_abandoned_cart_id` within the attribution window. PII (full customer phone) masked in the dashboard table unless caller has `orders:read_pii` role. Template variables server-escaped — client cannot inject HTML/markdown. Audit log entry on settings change and on every send attempt (success and failure). RLS on `abandoned_carts` and `recovery_attempts` scopes by tenant membership.

## Actionable Steps

1. - [ ] Audit `/api/public/cron/abandoned-carts` for Node-only deps; replace any provider SDK with fetch-based HTTP client
2. - [ ] Add partial unique index on `recovery_attempts (cart_id, attempt_number)` for idempotency
3. - [ ] Implement `recovery_opt_outs` table keyed by phone hash with insert on STOP keyword or manual mark
4. - [ ] Implement provider-webhook route to ingest delivery receipts and STOP keyword opt-outs (verify signature)
5. - [ ] Implement per-tenant rate-limit and provider-rate-limit guards in the cron handler
6. - [ ] Implement server-side template variable rendering with HTML/markdown escaping
7. - [ ] Implement stats server fn keyed `["recovery-stats", tenantId, window]` with short TTL
8. - [ ] Implement cursor-paginated carts list server fn with masked-phone projection by default
9. - [ ] Gate full phone reveal behind `orders:read_pii` role
10. - [ ] Implement "send test" server fn with strict rate limit and verified-phone requirement
11. - [ ] Implement "resend now" server fn that is idempotent against existing in-flight attempts
12. - [ ] Enforce delay tier (30/60/120/360) server-side using cart `updated_at` + tier
13. - [ ] Add attribution-window setting and ensure cron join uses the same window
14. - [ ] Add `orders.source_abandoned_cart_id` and update checkout to set it on conversion
15. - [ ] Wire TanStack Query invalidation for `["recovery-stats"]`, `["abandoned-carts"]` on settings change and resend
16. - [ ] Add audit log entry on settings change and every send attempt (success/failure with provider error)
17. - [ ] Add error boundary with retry; respect reduced-motion on KPI animations
18. - [ ] Add empty state "WhatsApp provider not configured" linking to Settings
19. - [ ] Add e2e test: two overlapping cron ticks produce exactly one send per (cart, attempt)
20. - [ ] Add e2e test: STOP keyword from provider webhook prevents future sends to that phone
21. - [ ] Add e2e test: user without PII role sees masked phone in carts table
22. - [ ] Add e2e test: cross-tenant cart access denied by RLS