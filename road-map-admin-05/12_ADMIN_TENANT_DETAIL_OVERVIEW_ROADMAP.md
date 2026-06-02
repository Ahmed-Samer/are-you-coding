# 12 — Admin Tenant Detail · Overview Tab Roadmap

Single tenant inspection: profile, status, owner, plan, KPIs, recent activity. The hub for all admin actions on a tenant.

## UX & Core Features
- [ ] Header: tenant name, slug, status pill, plan, owner email
- [ ] KPI tiles: MRR, total orders, active products, last-order-at
- [ ] Quick actions: Impersonate, Suspend, Reset password (owner), Send message
- [ ] Status-change dialog with reason field (required, audited)
- [ ] Recent-activity timeline (last 20 events from audit_logs scoped to this tenant)
- [ ] Tab nav to Billing and Audit sub-tabs
- [ ] Confirmation dialog before every destructive action
- [ ] Re-auth gate before Impersonate / status change

## Performance & Speed
- Single consolidated server-fn DTO for header + KPIs + recent activity — no N+1.
- Per-tenant audit query uses the composite index from screen 03.
- KPIs sourced from aggregate views, not full table scans.

## Backend & Cloudflare/Supabase Compliance
- DTO server fn gated by `requireSupabaseAuth` + admin role; uses `supabaseAdmin` for cross-tenant read.
- All status mutations write audit rows with diff + reason + actor.
- Suspend purges storefront cache for the tenant slug and fires Resend notice.
- Impersonate uses existing impersonation middleware; banner enforced on every page during impersonation.
- Reset-password triggers Supabase auth recovery email — never exposes a raw token to admins.
- PII fields (owner email, phone) masked for non-superadmin roles when applicable.

## Actionable Steps
- [ ] 1. Build a single `getTenantOverviewDTO` server fn returning header + KPIs + activity in one call
- [ ] 2. Wrap status mutations in a server fn with mandatory reason + audit + cache purge
- [ ] 3. Verify Impersonate writes audit and triggers the banner; banner cannot be dismissed
- [ ] 4. Enforce server-side recent-login re-auth for destructive actions
- [ ] 5. Wire Reset-password to Supabase auth recovery email — no admin sees the token
- [ ] 6. Add PII masking for non-superadmin roles if multi-admin-role exists
- [ ] 7. Add tests covering "Suspend → storefront 404 within TTL + audit row written"
- [ ] 8. Add tests covering "Impersonate → banner shown + audit row written + ended cleanly"