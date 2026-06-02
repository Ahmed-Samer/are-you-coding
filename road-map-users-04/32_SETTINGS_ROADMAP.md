# Screen 32 — Store Settings

Stack: Supabase (DB/Auth/Storage) + Cloudflare Pages (Workers/Edge). Phase 04, screen 32 of 33. Settings feed both the storefront (branding/checkout) and scheduled jobs (timezone for recovery/promos), so saves must invalidate the storefront edge cache and recompute scheduled windows.

## UX & Core Features

Tabbed settings panel. Each tab is its own form with dirty-state guard on navigation.

- [ ] Tabs: General, Branding, Checkout, Localization, Notifications, Integrations, Danger Zone
- [ ] General: store name, contact email, support phone, business address
- [ ] Branding: logo uploader (with dimension cap), favicon uploader, primary color picker, light/dark mode preview
- [ ] Checkout: enabled payment methods, COD toggle, minimum order amount, customer-required fields
- [ ] Localization: currency select, timezone select, default locale, supported locales (multi-select)
- [ ] Notifications: per-event email/WhatsApp toggle (order created, order shipped, refund, etc.)
- [ ] Integrations: WhatsApp provider credentials (write-only secret field), analytics IDs
- [ ] Danger Zone: transfer ownership, delete store (both gated by re-auth + typed confirmation)
- [ ] Dirty-state guard on tab switch / navigation
- [ ] Save button per tab with optimistic update and rollback on error
- [ ] Loading skeleton matching field geometry
- [ ] Error state with retry
- [ ] Toasts on save; inline field errors; warning toast on storefront-cache purge failure

## Performance & Speed

Each tab loads its own slice via a tab-scoped server fn so the initial paint doesn't block on heavy fields (e.g. integrations secrets). Logo/favicon uploads use signed upload URLs. Color picker debounced. Preview pane uses an iframe pointing at a draft-render endpoint so live preview doesn't re-render the entire settings form.

## Backend & Cloudflare/Supabase Compliance

RLS on `tenant_settings` scopes by tenant membership; writes restricted to admin role. **Currency change does NOT mutate historical orders** — currency is stored per-order at creation time. **Timezone change** triggers a recompute of any scheduled windows (recovery delays, promo expiries) that were stored as wall-clock times; recommendation is to store all schedules in UTC and only convert at display/comparison time using the tenant's current timezone. Logo/favicon uploads go through signed upload URLs with server-side MIME sniffing and dimension cap (rejecting oversized images at the Worker boundary). Every save calls `invalidateStorefront(tenantId, { scope: "branding" | "checkout" | "all" })`. Destructive actions (transfer ownership, delete store) require fresh re-authentication and a typed-confirmation modal. Integration secrets stored encrypted at rest (Supabase Vault or column-level pgcrypto); never returned to the client in plaintext (write-only fields). Audit log entry on every save with before/after diff (with secret fields redacted). Edge-safe — no Node-only deps.

## Actionable Steps

1. - [ ] Split settings into tab-scoped server fns (general / branding / checkout / localization / notifications / integrations)
2. - [ ] Implement signed-upload-URL server fn for logo and favicon with MIME sniffing and dimension cap
3. - [ ] Store all scheduled windows in UTC; convert at display/comparison using tenant timezone
4. - [ ] Ensure orders snapshot currency at creation time (do not recompute from current setting)
5. - [ ] Encrypt integration secrets at rest; never return in plaintext (write-only API)
6. - [ ] Implement transfer-ownership server fn with re-auth + typed confirmation
7. - [ ] Implement delete-store server fn with grace period and re-auth + typed confirmation
8. - [ ] Call `invalidateStorefront(tenantId, scope)` on every save with appropriate scope
9. - [ ] Wire TanStack Query invalidation for `["tenant-settings"]`, `["my-tenants"]` on every save
10. - [ ] Add dirty-state guard on tab switch / route navigation
11. - [ ] Add audit log entry on every save (secret fields redacted) and on destructive actions
12. - [ ] Add error boundary with retry
13. - [ ] Add skeleton matching field geometry
14. - [ ] Add e2e test: currency change does not alter historical orders
15. - [ ] Add e2e test: branding save reflects on storefront within one revalidation cycle
16. - [ ] Add e2e test: integration secret is never returned to client
17. - [ ] Add e2e test: delete-store blocked without re-auth
18. - [ ] Add e2e test: non-admin cannot write settings