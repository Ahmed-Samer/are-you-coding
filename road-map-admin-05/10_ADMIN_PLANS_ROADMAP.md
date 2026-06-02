# 10 — Admin Plans Roadmap

Subscription plans and pricing tiers. Plan changes must never retroactively alter active subscriptions or historical invoices.

## UX & Core Features
- [ ] List of plans with name, price, currency, interval, features, status
- [ ] Create/edit dialog with feature-list editor
- [ ] Versioning indicator (plan v1, v2 …) on every row
- [ ] Archive toggle (soft-disable) instead of delete
- [ ] "Used by N subscriptions" count per plan
- [ ] Confirmation dialog before any price/feature change
- [ ] Diff preview before commit
- [ ] Public-pricing-page preview link

## Performance & Speed
- Plans table cached at edge for the public `/pricing` page; cache purged on every write.
- Subscriptions reference an immutable `plan_version_id`, not the mutable plan row, so historical pricing is preserved.
- Reads cap returned columns to what the UI needs.

## Backend & Cloudflare/Supabase Compliance
- Writes via `supabaseAdmin` inside admin-gated server fn; audit row per change with full diff.
- "Edit" actually inserts a new `plan_versions` row and points the plan to the latest version — existing subscriptions remain on their pinned version.
- Archive sets `archived_at`; archived plans hidden from new signups but still resolvable for existing subscribers.
- Edge cache purge fires on every write so the public pricing page updates within one TTL.
- Currency values stored in minor units (cents) as integers — never floats.

## Actionable Steps
- [ ] 1. Introduce `plan_versions` and migrate subscriptions to reference `plan_version_id`
- [ ] 2. Convert price edits to "insert new version + repoint" rather than UPDATE in place
- [ ] 3. Wrap all writes in admin-gated server fns with audit + cache purge
- [ ] 4. Add archive toggle with "block new signups but honor existing" semantics
- [ ] 5. Add a server-side check preventing delete when subscriptions reference any version
- [ ] 6. Add tests: "change price → existing subscriptions keep old price on renewal"
- [ ] 7. Add tests: "archive plan → hidden from /pricing within TTL"
- [ ] 8. Verify currency stored as integer minor units everywhere