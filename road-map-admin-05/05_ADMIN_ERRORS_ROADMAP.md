# 05 — Admin Errors Roadmap

Captured application error reports across client and server. Admin triage surface for production incidents.

## UX & Core Features
- [ ] Search by message or URL substring
- [ ] Scope filter (`all` / `client` / `server`) with URL state
- [ ] Pagination with previous/next and total count
- [ ] Severity badge per row
- [ ] Row drawer with full stack trace, breadcrumbs, request id, and tenant id when present
- [ ] "Mark resolved" / "Group" actions (future)
- [ ] Empty state when filters return zero rows
- [ ] Time-ago label that re-renders on tab focus

## Performance & Speed
- Cursor pagination keyed on `(created_at desc, id desc)` with composite index.
- Stack traces lazy-loaded per row (drawer open), not in list payload.
- Hard cap on page size enforced server-side.

## Backend & Cloudflare/Supabase Compliance
- Ingestion endpoint at `/api/public/errors` — rate-limited per IP+UA fingerprint, schema-validated with Zod.
- PII scrubbing applied server-side on ingest (emails, tokens, secrets stripped from messages/stacks).
- Reads gated by `requireSupabaseAuth` + admin role.
- Scope filter validated against an allowlist; never passed raw into SQL.
- Retention cron prunes rows beyond configured window.

## Actionable Steps
- [ ] 1. Audit `/api/public/errors` for rate limiting, body-size cap, and Zod validation
- [ ] 2. Add a server-side PII scrubber applied before insert
- [ ] 3. Add composite index `(created_at desc, id desc)` and switch listing to cursor pagination
- [ ] 4. Move stack-trace fetch into a per-row server fn
- [ ] 5. Validate scope parameter against an allowlist in the server fn
- [ ] 6. Add retention cron under `/api/public/cron/*` with signature verification
- [ ] 7. Add tests covering "non-admin → 401" and "PII stripped from message before write"
- [ ] 8. Surface error-rate KPI on the Admin Home tile