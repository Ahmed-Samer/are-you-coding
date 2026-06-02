# 03 — Admin Audit Log Roadmap

Chronological, append-only record of every admin and security-relevant action. The audit log is the system of record for "who did what, when, from where".

## UX & Core Features
- [ ] Search filter (actor, action, target table, target id, IP)
- [ ] Date-range picker with sane defaults (last 7 days)
- [ ] Action-type facet filter
- [ ] Row drawer reveals full diff JSON, UA, IP, request id
- [ ] Export CSV gated behind the `admin_audit_export` feature flag
- [ ] Cursor-based pagination (no offset jumps over 100k rows)
- [ ] Empty-state message when filters return no rows
- [ ] Tooltip explaining that the export flag is required when disabled

## Performance & Speed
- Cursor pagination on `(created_at desc, id desc)` with composite index.
- Server returns a hard page-size cap (e.g. 200) regardless of client input.
- Diff JSON lazy-loaded per row (drawer open), not in the list payload.
- CSV export streams rows; never buffers full result set.

## Backend & Cloudflare/Supabase Compliance
- `audit_logs` table is append-only: no UPDATE / DELETE RLS policies for any role.
- Writes go through the centralized audit helper using `supabaseAdmin`; failures log but never block the originating mutation.
- Reads require `requireSupabaseAuth` + admin role; PII fields (IP, UA) only visible to admins.
- Retention policy documented; a cron prunes rows older than the configured retention window.
- Export honors the feature flag server-side, not just in the UI.

## Actionable Steps
- [ ] 1. Confirm `audit_logs` has no UPDATE/DELETE policies for any non-service role
- [ ] 2. Add composite index on `(created_at desc, id desc)` for cursor pagination
- [ ] 3. Convert listing server fn to cursor pagination with capped page size
- [ ] 4. Move diff JSON fetch into a per-row server fn called from the drawer
- [ ] 5. Implement streaming CSV export with server-side flag check
- [ ] 6. Add a signature-verified cron route to enforce retention
- [ ] 7. Verify every admin mutation in the codebase routes through the audit helper
- [ ] 8. Add tests covering "audit row written on success" and "audit failure does not roll back action"