# 02 — Admin Analytics Roadmap

Platform-wide metrics: revenue timeline, plan mix, funnels, cohort retention, top tenants. Read-only but compute-heavy.

## UX & Core Features
- [ ] Window selector (7d / 30d / 90d / custom) persists in URL search params
- [ ] Revenue timeline chart with hover tooltips and currency formatting
- [ ] Revenue-by-plan donut with legend toggles
- [ ] Signup → activation → first-order funnel chart
- [ ] Cohort retention heatmap with month-over-month buckets
- [ ] Top tenants table with sortable columns and pagination
- [ ] Export menu (CSV / JSON) gated behind the `admin_analytics_export` flag
- [ ] Loading skeletons per panel; panels fail independently
- [ ] Error boundary per chart so one failure doesn't blank the page

## Performance & Speed
- Aggregations live in SQL views / materialized views — never compute in the Worker.
- Each chart fetched as its own server fn so slow queries don't block fast ones.
- Export streams rows to CSV instead of buffering full result sets (Worker memory ceiling).
- Charts memoize derived series; window changes invalidate only affected queries.

## Backend & Cloudflare/Supabase Compliance
- All server fns gated by `requireSupabaseAuth` + admin role check.
- Materialized views refreshed on a schedule via a signature-verified cron route under `/api/public/cron/*`.
- Heavy reads use `supabaseAdmin` for cross-tenant aggregation; no broad `TO anon` policies.
- Export feature-flag check is server-authoritative, not just UI hiding.
- CSV cell escaping is centralized (no string interpolation into rows).

## Actionable Steps
- [ ] 1. Inventory current analytics queries and move heavy aggregates into SQL views
- [ ] 2. Split the dashboard into per-panel server fns with independent query keys
- [ ] 3. Add streaming CSV/JSON export endpoints under `/api/public/cron`-style auth or admin-gated server fns
- [ ] 4. Enforce `admin_analytics_export` flag check inside the export handler
- [ ] 5. Add per-panel `errorComponent` so one failure doesn't blank the dashboard
- [ ] 6. Add a refresh cron for any materialized views with signature verification
- [ ] 7. Verify window selector URL state survives reload and back/forward
- [ ] 8. Add tests asserting non-admin users get 401 on every analytics server fn