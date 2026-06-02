# Admin Pages Inventory

A complete inventory of every screen, dashboard view, and action screen exclusive to the **Platform Administrator**. All routes live under `/_authenticated/admin/*` and are gated by an admin-claim check that redirects non-admins to the dashboard.

> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages.

1. **Admin Home (Index)** — Platform admin landing dashboard with high-level overview and navigation.
2. **Analytics** — Platform-wide metrics: revenue timelines, funnels, cohorts, and top tenants.
3. **Audit Log** — Chronological record of administrative and security-relevant actions.
4. **Billing Dunning** — Failed-payment / dunning management for overdue subscriptions.
5. **Errors** — Captured application error reports and diagnostics.
6. **Feature Flags** — Toggle platform feature flags on or off.
7. **FX Rates** — View and manage currency exchange rates used across the platform.
8. **Payment Methods** — Configure and review available platform payment methods.
9. **Payments** — Review and verify tenant payment proofs and transactions.
10. **Plans** — Create and manage subscription plans and pricing tiers.
11. **Tenants (List)** — Searchable list of all tenant stores on the platform.
12. **Tenant Detail — Overview** — Single tenant detail screen, Overview tab (profile and status).
13. **Tenant Detail — Billing** — Single tenant detail screen, Billing tab (ledger, invoices, refunds, overrides).
14. **Tenant Detail — Audit** — Single tenant detail screen, Audit tab (tenant-scoped activity).
15. **Webhooks** — Monitor outbound webhook delivery, inspect failed payloads, and trigger retries.

---

**Total platform-administrator-only screens: 15** (including the 3 tabs of the Tenant Detail screen counted separately).
