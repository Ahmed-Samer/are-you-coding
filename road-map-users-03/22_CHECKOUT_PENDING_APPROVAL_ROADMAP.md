# Checkout — Pending Approval — Production Roadmap

> Phase 03: Subscription Checkout & Tenant Dashboard Entry · Screen 22 of 24 (Wizard step 4 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

Terminal wizard state shown after proof submission while an admin verifies the bank transfer. This screen is the direct upstream of Screen 23 (Dashboard Store List) — the user's next action is almost always "go to my dashboard" and confirm their newly created store is listed with an "Awaiting approval" badge. This file owns the **pending-approval-side fix surface** for the dashboard render bug.

---

## 1. UX & Core Features

**Current state**
- Confirmation copy that proof has been received and is under review.
- A primary CTA back to the dashboard.

**Interactive elements & states to track**
- [ ] "Submitted — under review" status badge
- [ ] Estimated review time copy (e.g. "usually < 24h")
- [ ] "Go to your dashboard" primary CTA (must invalidate tenant queries before navigating)
- [ ] "Replace proof" affordance (re-routes to Screen 21 in controlled-replace mode)
- [ ] "Contact support" escape hatch
- [ ] Live status indicator (poll or Supabase realtime) — flips to "Approved!" without a refresh
- [ ] Approved state → CTA changes to "Open your store"
- [ ] Rejected state → CTA to "Replace proof" + admin reason text
- [ ] Cancelled state → CTA to "Start a new checkout"
- [ ] Loading/empty/error states for the status subscription

**Gaps & risks**
- Page does not subscribe to status changes; users must refresh to see approval/rejection.
- "Go to dashboard" CTA may navigate before the tenant-list query is invalidated, causing the newly created store to appear missing on first paint (the dashboard render bug — see Screen 23 deep-dive).
- No "replace proof" or "contact support" affordances when admin requests a better screenshot.
- No email notification on approval/rejection.
- Polling/realtime channels (if added) must be closed on unmount and respect document visibility / reduced-motion.

**World-class targets**
- Supabase realtime subscription on the `subscriptions` row (or short polling fallback) flips the UI to "Approved!" the moment admin acts.
- Dashboard query invalidation is awaited before navigation so the store appears immediately on arrival.
- Approval/rejection both trigger an email via Resend.
- Clear "replace proof" path that re-opens Screen 21 in idempotent-replace mode.
- Channel lifecycle is correct: closed on unmount, paused while the tab is hidden.

---

## 2. Performance & Speed

- Realtime channel is cheap and removes the need for aggressive polling; if polling is used instead, back off (e.g. 5s → 15s → 30s) and pause when the tab is hidden.
- Initial render is a single read of the subscription DTO; everything else is push-driven.
- CTA should `await` the dashboard query invalidation, then navigate — the perceived wait is < 200ms and prevents the "missing store" illusion.
- No CLS: reserve the status-badge row so it can flip without shifting the CTA.

---

## 3. Backend & Cloudflare/Supabase Compliance

- Status read via `requireSupabaseAuth`-protected server function; RLS scoped to tenant membership (no status predicate — see Screen 23 deep-dive).
- Realtime subscription uses the publishable key on the client and is scoped to the user's own subscription row via RLS.
- On approval, the admin server function transitions `subscriptions.status` to `active`, sets `tenants.status` to `active`, and emits an audit log entry — atomically.
- Notification emails (approved/rejected) go through the existing email-flush cron + Resend setup; they are idempotent.
- Edge-safe: no Node-only deps; polling/realtime use Worker-compatible Supabase client.
- Cross-cutting Phase-03 theme: **cache invalidation discipline** — this screen is the second of two write-side trigger points (after Screen 21) that MUST invalidate `["my-tenants"]` and `["my-tenants-stats"]` on every status transition observed.

---

## 4. Actionable Steps (production checklist)

1. - [ ] Subscribe to the subscription row via Supabase realtime (or short polling fallback) and reflect status changes in the UI without a manual refresh.
2. - [ ] On every observed status change, invalidate `["my-tenants"]` and `["my-tenants-stats"]` (dashboard render-bug fix surface).
3. - [ ] Make the "Go to your dashboard" CTA `await` query invalidation before navigating.
4. - [ ] Add an Approved state with "Open your store" CTA.
5. - [ ] Add a Rejected state showing the admin reason and a "Replace proof" CTA that re-opens Screen 21 in controlled-replace mode.
6. - [ ] Add a Cancelled state with a "Start a new checkout" CTA.
7. - [ ] Add a "Contact support" escape hatch.
8. - [ ] Send approval/rejection email via Resend (idempotent).
9. - [ ] Close realtime channels on unmount; pause polling when the document is hidden.
10. - [ ] Reserve the status-badge layout to prevent CLS when the status flips.
11. - [ ] Confirm the status read server function returns `Cache-Control: private, no-store`.
12. - [ ] Verify the channel/polling path is edge-safe and Worker-compatible.