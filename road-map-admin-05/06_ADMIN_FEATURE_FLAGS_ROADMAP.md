# 06 — Admin Feature Flags Roadmap

Toggle and gradually roll out features. Flag reads are hot-path; writes are admin-only and audited.

## UX & Core Features
- [ ] Flag list with key, description, enabled switch, rollout slider
- [ ] Slider commits on release, not on every frame
- [ ] Confirmation toast on every toggle/rollout change
- [ ] Search/filter by key
- [ ] Inline edit of description
- [ ] "Create flag" dialog with key validation (`^[a-z][a-z0-9_]+$`)
- [ ] Disabled state when rollout=0 vs enabled+rollout — visually distinct

## Performance & Speed
- Flag list cached per-tenant on the edge with short TTL (e.g. 30s) and purged on write.
- Server-side `isFeatureEnabled(key, userId)` uses consistent-hash(userId+key) → 0..99 bucket for stable rollout.
- Reads avoid per-request DB round-trips by caching in a request-scoped memo.

## Backend & Cloudflare/Supabase Compliance
- Writes gated by `requireSupabaseAuth` + admin role; service-role write via `supabaseAdmin`.
- Every toggle/rollout change writes an audit row with `{key, before, after}` diff.
- Cache purge fires on every write so callers see the change within one TTL.
- Public reads (if any) go through a server fn, never directly exposing the table to `anon`.

## Actionable Steps
- [ ] 1. Define and document the consistent-hashing key (`userId+flagKey`) for rollout buckets
- [ ] 2. Wrap toggle/rollout mutations in a server fn that writes audit + purges cache
- [ ] 3. Add a request-scoped memo for `isFeatureEnabled` to avoid duplicate reads in one request
- [ ] 4. Add validation for flag-key format on create
- [ ] 5. Confirm `feature_flags` table has no `TO anon` SELECT policy
- [ ] 6. Add tests for "toggle writes audit row" and "rollout 50% is stable across requests"
- [ ] 7. Add a "test as user X" helper so admins can preview a flag for a specific user id
- [ ] 8. Document the canonical list of flags in `infrastructure/`