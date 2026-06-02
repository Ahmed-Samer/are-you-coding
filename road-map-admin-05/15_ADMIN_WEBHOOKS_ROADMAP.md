# 15 — Admin Webhooks Roadmap

Monitor outbound webhook delivery, inspect failed payloads, and trigger retries. Critical for integrations with tenant CRMs, accounting, and notification systems.

## UX & Core Features
- [ ] KPI cards: delivered last 24h, failing endpoints, p95 latency, retry queue depth
- [ ] Events table: endpoint, event type, status, attempts, last-attempt, response code
- [ ] Status filter (`delivered` / `failing` / `dead`)
- [ ] Row drawer: request headers, request body, response headers, response body
- [ ] "Retry now" button per row — uses exponential backoff queue
- [ ] Bulk retry for a date range (confirmed)
- [ ] Secret values redacted in payload viewer
- [ ] Endpoint health badge per endpoint (rolling 1h success rate)
- [ ] Alerting toggle per endpoint

## Performance & Speed
- Events table paginated (cursor) with composite index on `(endpoint_id, created_at desc)`.
- Payload bodies stored separately and loaded lazily per drawer open.
- Retry queue uses exponential backoff (`2^attempts * base`, capped) to avoid hammering broken endpoints.
- Dispatch cron route `/api/public/cron/webhook-dispatch` processes a bounded batch per tick.

## Backend & Cloudflare/Supabase Compliance
- Cron route verifies signature before processing.
- Outbound HTTP via `fetch` (edge-safe); no Node-only HTTP libs.
- Each delivery attempt records `request_id`, status, latency, response snippet.
- Reads/retries gated by `requireSupabaseAuth` + admin role.
- Payload viewer redacts secrets (Authorization headers, tokens) server-side before returning.
- Failed-delivery alerting fires Resend with idempotency key `endpoint_id + day + 'alert'` to avoid spam.
- Dead-letter queue for events that exceed max attempts; admin can re-enqueue with audit row.

## Actionable Steps
- [ ] 1. Verify dispatch cron route has signature verification and processes a bounded batch
- [ ] 2. Add composite index `(endpoint_id, created_at desc)` for the events table
- [ ] 3. Move payload body fetch into a per-row server fn (lazy drawer load)
- [ ] 4. Implement exponential backoff with cap and dead-letter handoff
- [ ] 5. Add server-side secret redaction before returning payloads to the UI
- [ ] 6. Add Resend failed-delivery alerts with idempotency keys
- [ ] 7. Add audit rows for every manual retry and DLQ re-enqueue
- [ ] 8. Add tests: "double-click Retry → one dispatch, one audit row"
- [ ] 9. Add tests: "endpoint 5xx for N attempts → moved to DLQ, alert sent once per day"
- [ ] 10. Document signature header contract for consumers of outbound webhooks