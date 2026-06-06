# Admin Page Map

Mirrors `admin-pages/ADMIN_PAGES_INVENTORY.md` (15 screens, including the
three Tenant-Detail tabs counted separately).

1. Admin Home (Index) — `src/routes/_authenticated/admin.index.tsx`
2. Analytics — `src/routes/_authenticated/admin.analytics.tsx`
3. Audit Log — `src/routes/_authenticated/admin.audit.tsx`
4. Billing Dunning — `src/routes/_authenticated/admin.billing.dunning.tsx`
5. Errors — `src/routes/_authenticated/admin.errors.tsx`
6. Feature Flags — `src/routes/_authenticated/admin.flags.tsx`
7. FX Rates — `src/routes/_authenticated/admin.fx-rates.tsx`
8. Payment Methods — `src/routes/_authenticated/admin.payment-methods.tsx`
9. Payments — `src/routes/_authenticated/admin.payments.tsx`
10. Plans — `src/routes/_authenticated/admin.plans.tsx`
11. Tenants (List) — `src/routes/_authenticated/admin.tenants.tsx`
12. Tenant Detail — Overview — `src/routes/_authenticated/admin.tenants.$tenantId.tsx` (overview tab)
13. Tenant Detail — Billing — same route, billing tab
14. Tenant Detail — Audit — same route, audit tab
15. Webhooks — `src/routes/_authenticated/admin.webhooks.tsx`

## Deep-audit status

**Deferred.** This round audits user pages only. Each admin screen will
receive the same rigorous treatment in a follow-up pass; the candidates
with the highest risk going into that pass are:

- Admin Payments (proof approval flow — drives subscription activation)
- Admin Tenants — Billing tab (adjustments table; recently FK-repointed)
- Billing Dunning (newly relevant after the kill-switch trigger ships)