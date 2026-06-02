# 01 — Admin Home (Index) Roadmap

Landing dashboard for Platform Administrators. Surfaces top-line KPIs (active tenants, MRR, pending approvals, error rate) and quick-jump tiles to every other admin section.

## UX & Core Features
- [ ] KPI tiles render server-rendered with skeletons during navigation
- [ ] Pending-approvals badge updates in near-real-time (polling or realtime)
- [ ] Quick-jump grid: Tenants, Payments, Plans, FX, Flags, Webhooks, Audit, Errors
- [ ] Empty state when the platform has zero tenants
- [ ] Error boundary with retry that calls `router.invalidate()` and `reset()`
- [ ] Non-admin visitors are redirected to `/dashboard` before any tile renders
- [ ] "Impersonating" banner is honored when an active impersonation token exists

## Performance & Speed
- All KPIs returned by a single consolidated server-fn DTO — no N+1 round-trips.
- `Cache-Control: private, no-store` so the edge never serves another admin's snapshot.
- Tiles use `useSuspenseQuery` against a stable query key, preloaded in the loader.
- Counts pulled from indexed aggregate views, not full table scans.

## Backend & Cloudflare/Supabase Compliance
- Layout `beforeLoad` re-validates `has_role(auth.uid(), 'admin')` via a server fn on every navigation; any failure (network, missing claim, expired session) redirects to `/dashboard`.
- DTO server fn uses `requireSupabaseAuth` + explicit admin re-check, then queries via `supabaseAdmin` only for cross-tenant reads.
- No service-role client imported in client modules; all admin reads/writes stay inside `*.functions.ts` handlers.
- Edge-safe: no Node-only deps, no `child_process`, no native modules.

## Actionable Steps
- [ ] 1. Audit admin layout guard and add a server-side admin re-check on every navigation
- [ ] 2. Build a single `getAdminHomeDTO` server fn returning all tile values in one round-trip
- [ ] 3. Add `Cache-Control: private, no-store` to the DTO response headers
- [ ] 4. Wire `useSuspenseQuery` + `ensureQueryData` in the loader with a stable query key
- [ ] 5. Add pending-approvals realtime/polling refresh keyed to the same query
- [ ] 6. Add error boundary + not-found boundary with retry that invalidates the query
- [ ] 7. Verify impersonation banner shows when active and audit-log entry is written on view
- [ ] 8. Add a Playwright spec covering "non-admin → redirected" and "admin → tiles render"