# Screen 30 — Custom Domains

Stack: Supabase (DB/Auth) + Cloudflare Pages (Workers/Edge). Phase 04, screen 30 of 33. Verification must be server-authoritative; client cannot claim "verified". If integrating Cloudflare for Platforms Custom Hostnames, API tokens stay server-only.

## UX & Core Features

- [ ] Header with "Add domain" CTA and "How it works" help link
- [ ] Domain list with columns: hostname, status (pending DNS / verifying / active / failed), SSL state, attached date
- [ ] Row action: re-check now (rate-limited)
- [ ] Row action: detach (with confirmation, falls back to stable `project--{id}.lovable.app`)
- [ ] Add-domain dialog: hostname input with apex-vs-subdomain detection
- [ ] Manual CNAME / TXT instructions panel with copy-to-clipboard for each value
- [ ] Live DNS diff view: expected record vs currently resolved record
- [ ] SSL provisioning status badge (pending / active / failed) with retry button on failed
- [ ] Plan-tier cap indicator: "X of Y domains used"
- [ ] Empty state: "no custom domains" with CTA
- [ ] Loading skeleton matching row geometry
- [ ] Error state with retry
- [ ] Toasts on add / detach / re-check; inline validation errors on hostname format

## Performance & Speed

Domain list is small — single server fn, no pagination. DNS check runs server-side via `fetch` against DNS-over-HTTPS (Cloudflare 1.1.1.1 or Google 8.8.8.8 JSON API) — edge-safe, no `dns` Node module. Periodic re-verification runs in `/api/public/cron/verify-domains` (already scaffolded). Manual re-check button has its own rate limit independent of cron.

## Backend & Cloudflare/Supabase Compliance

RLS on `domains` scopes by tenant membership and admin role (only admins can attach/detach). Hostname normalized to lowercase and validated against a strict regex server-side. Verification ALWAYS runs server-side: DNS-over-HTTPS lookup, expected-value comparison, then status update. Client can request a re-check but cannot mark verified. If using Cloudflare for Platforms Custom Hostnames API, the API token is read from `process.env.CLOUDFLARE_API_TOKEN` inside server fn handlers ONLY — never `VITE_*`, never logged. The Cloudflare hostname id is persisted on the domain row so SSL state can be polled. Plan-tier domain cap is read from the live subscription, not cached client state. Per-tenant uniqueness on hostname enforced by unique index. Audit log entry on attach / detach / verify / SSL state change. The dashboard preview URL (Screen 23) uses the verified hostname when active and falls back to the stable `project--{id}.lovable.app` host otherwise — no dev-only `?store=` override in production.

## Actionable Steps

1. - [ ] Add unique index on `domains (lower(hostname))` (global) plus FK to tenant
2. - [ ] Implement attach-domain server fn with hostname normalization and regex validation
3. - [ ] Implement DNS-over-HTTPS verification helper using `fetch` (no Node `dns` module)
4. - [ ] Implement re-check server fn with rate limit per (tenant, hostname)
5. - [ ] Update `/api/public/cron/verify-domains` to use the same verification helper and update SSL state
6. - [ ] If using Cloudflare Custom Hostnames API, persist `cf_hostname_id` and read API token from `process.env.CLOUDFLARE_API_TOKEN` server-side only
7. - [ ] Add plan-tier domain cap check from live subscription read on attach
8. - [ ] Implement detach server fn with confirmation; null out any tenants pointing at it
9. - [ ] Update dashboard preview link (Screen 23) to use verified hostname when active, stable host otherwise
10. - [ ] Remove the dev-only `?store=` override from production code paths
11. - [ ] Add audit log entry on attach / detach / verify / SSL state change
12. - [ ] Wire TanStack Query invalidation for `["tenant-domains"]` and `["my-tenants"]` on every write
13. - [ ] Add error boundary with retry
14. - [ ] Add skeleton matching row geometry
15. - [ ] Verify no Node-only deps imported in the domains module
16. - [ ] Add e2e test: client cannot mark domain verified without matching DNS
17. - [ ] Add e2e test: plan-tier cap blocks adding beyond the limit
18. - [ ] Add e2e test: cross-tenant domain mutation denied by RLS