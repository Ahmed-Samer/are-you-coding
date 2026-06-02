# 07 — Admin FX Rates Roadmap

Currency exchange rates used across checkout, billing, and analytics. Must be the single source of truth — no hardcoded rates anywhere in the codebase.

## UX & Core Features
- [ ] Table of base→quote pairs with current rate, source, last-updated, drift vs prior
- [ ] Manual override dialog with reason field (required, audited)
- [ ] "Refresh now" button triggers an immediate cron run (idempotent)
- [ ] Stale-rate warning badge when last update older than threshold
- [ ] History drawer per pair showing last N changes
- [ ] Confirmation dialog before saving any override

## Performance & Speed
- Checkout reads rates from a small in-memory snapshot refreshed on each cron tick — not per-request DB hits.
- FX table cached at edge with short TTL; cache purged on every write/cron run.
- History stored in a separate append-only table; main table holds only current.

## Backend & Cloudflare/Supabase Compliance
- Cron route `/api/public/cron/fx-rates` verifies signature header before processing.
- Cron fetches upstream provider via fetch (edge-safe); upstream key in `process.env`, never `VITE_*`.
- Override writes use `supabaseAdmin` after admin + role check, with audit row and reason.
- Checkout pricing always derives from this table — code search must show zero hardcoded FX constants.
- Edge cache invalidation hook fires on every successful write to refresh the storefront/checkout snapshot.

## Actionable Steps
- [ ] 1. Grep the codebase for any hardcoded FX constants and remove them in favor of table reads
- [ ] 2. Verify the cron route signature check; reject unsigned requests
- [ ] 3. Add a "Refresh now" admin action that invokes the same cron handler
- [ ] 4. Make override server fn write reason+diff to audit and purge edge cache
- [ ] 5. Add stale-rate alert (Resend) when last update > threshold
- [ ] 6. Persist history in append-only `fx_rate_history` with composite index
- [ ] 7. Add a checkout-pricing integration test that flips a rate and asserts checkout recalculates
- [ ] 8. Document the upstream provider, key location, and fallback behavior