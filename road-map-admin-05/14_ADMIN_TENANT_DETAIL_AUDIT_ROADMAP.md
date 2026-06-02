# 14 — Admin Tenant Detail · Audit Tab Roadmap

Tenant-scoped slice of the global audit log. Same append-only invariants as screen 03, scoped server-side.

## UX & Core Features
- [ ] Filter by action type and date range
- [ ] Search by actor (email or id)
- [ ] Cursor pagination
- [ ] Row drawer with diff JSON, IP, UA, request id
- [ ] Export CSV gated by the `admin_audit_export` flag
- [ ] Empty state when no events match
- [ ] Status timeline view toggle (chronological status changes only)

## Performance & Speed
- Tenant filter applied server-side (never client-side) via composite index on `(target_table, target_id, created_at desc)`.
- Diff JSON lazy-loaded per row.
- Hard page-size cap.

## Backend & Cloudflare/Supabase Compliance
- Read gated by `requireSupabaseAuth` + admin role.
- Tenant scope enforced server-side; client cannot pass an arbitrary tenant id and get rows for another tenant unless admin (admins always can — that is the use case).
- Append-only invariant inherited from screen 03.
- Export flag check enforced server-side.

## Actionable Steps
- [ ] 1. Add composite index `(target_table, target_id, created_at desc)` for tenant-scoped reads
- [ ] 2. Move filter logic entirely into the server fn; client passes filter params only
- [ ] 3. Reuse the lazy diff-fetch server fn from screen 03
- [ ] 4. Enforce export flag server-side
- [ ] 5. Add a status-only timeline view derived from the same data
- [ ] 6. Add tests: "non-admin → 401", "filter narrows correctly to tenant"
- [ ] 7. Verify the tab respects impersonation context (impersonation events visible)
- [ ] 8. Document the audit-event vocabulary used by this tenant view