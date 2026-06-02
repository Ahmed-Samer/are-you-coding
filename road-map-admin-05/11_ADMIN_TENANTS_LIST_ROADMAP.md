# 11 — Admin Tenants List Roadmap

Searchable directory of every tenant store on the platform. Entry point to Tenant Detail.

## UX & Core Features
- [ ] Search by name, slug, owner email, custom domain
- [ ] Status filter: `pending` / `review` / `active` / `suspended` / `archived`
- [ ] Plan filter
- [ ] Sort by created-at, MRR, last-activity
- [ ] Cursor pagination with previous/next
- [ ] Row badges: status, plan, custom-domain present, impersonation-active
- [ ] Row click → Tenant Detail Overview
- [ ] Quick-action menu per row: Impersonate, Suspend, Send message
- [ ] Confirmation dialog before Suspend / Impersonate
- [ ] Empty state when filters return no rows

## Performance & Speed
- Server-side search/filter/sort — never load full tenant list client-side.
- Cursor pagination on `(created_at desc, id desc)` with composite index.
- Search uses a trigram index or `tsvector` column on name/slug/email — no `ILIKE %x%` table scans.
- Hard page-size cap enforced server-side.

## Backend & Cloudflare/Supabase Compliance
- Read server fn gated by `requireSupabaseAuth` + admin role; uses `supabaseAdmin` for cross-tenant scan.
- Status filter validated against an allowlist; never interpolated into SQL.
- Suspend writes audit row, purges storefront cache for that tenant slug, fires Resend notification.
- Impersonation uses the existing impersonation middleware and writes a "impersonation_started" audit row; banner enforced.

## Actionable Steps
- [ ] 1. Add trigram / tsvector index for tenant search columns
- [ ] 2. Switch listing to cursor pagination with capped page size
- [ ] 3. Validate all filter inputs against allowlists in the server fn
- [ ] 4. Wrap Suspend in a server fn with audit + cache purge + Resend notice
- [ ] 5. Confirm Impersonate writes audit row and triggers the banner everywhere
- [ ] 6. Add tests: "non-admin → 401", "search returns expected ranks"
- [ ] 7. Verify no service-role client imported in the route module
- [ ] 8. Add empty-state copy distinguishing "no tenants yet" from "no matches"