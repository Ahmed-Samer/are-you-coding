# 08 — Admin Payment Methods Roadmap

Configure which payment methods the platform offers tenants at checkout. Changes must propagate to checkout without code edits or redeploys.

## UX & Core Features
- [ ] List of methods with enable/disable switch and per-method config
- [ ] Per-method JSON config editor with schema validation
- [ ] Display order drag-and-drop
- [ ] Per-method icon upload (signed URL upload)
- [ ] Bank-instructions sub-editor (reference for screen 20)
- [ ] Confirmation toast on save; diff shown before commit
- [ ] Disabled state when method is referenced by an active subscription (block delete)

## Performance & Speed
- Methods table cached at edge per locale; cache purged on every write.
- Checkout reads cached snapshot — no per-request DB hit.
- Icon assets served from Supabase Storage with long-cache + content-hash filenames.

## Backend & Cloudflare/Supabase Compliance
- Writes via `supabaseAdmin` inside an admin-gated server fn; audit row per change.
- Per-method config validated against a Zod schema before insert/update.
- Checkout MUST read from this table — no hardcoded method list in the checkout UI.
- Edge cache invalidation fires on every write; tenants see new methods within one TTL.
- Icon uploads via signed URLs with size/mime allowlist; no raw service-role exposure to the browser.

## Actionable Steps
- [ ] 1. Grep checkout code for hardcoded method names/icons; remove in favor of table reads
- [ ] 2. Add a Zod schema per method type and validate on write
- [ ] 3. Wrap mutations in an admin-gated server fn that writes audit + purges cache
- [ ] 4. Implement signed-URL icon uploads with size/mime checks
- [ ] 5. Block delete when an active subscription references the method
- [ ] 6. Add tests for "disable method → checkout no longer offers it within TTL"
- [ ] 7. Verify bank-instructions editor writes to the same source the checkout reads
- [ ] 8. Add display-order persistence and verify ordering in the storefront checkout