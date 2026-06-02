# Checkout — Upload Proof — Production Roadmap

> Phase 03: Subscription Checkout & Tenant Dashboard Entry · Screen 21 of 24 (Wizard step 3 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

Step 3 of the checkout wizard. The user uploads a screenshot or PDF of the bank transfer; the file is persisted in Supabase Storage, a `payment_proofs` record is created, and the subscription advances from `pending_payment` to `pending_review`. This screen is also a **critical write-side trigger** for the dashboard "where is my store?" bug (see deep-dive in Screen 23 — this file owns the upload-side fix).

---

## 1. UX & Core Features

**Current state**
- A drag-and-drop / file-input control accepts an image or PDF.
- On submit, the file uploads and the subscription transitions to `pending_review`.
- The user is moved to step 4 (pending approval).

**Interactive elements & states to track**
- [ ] File picker / drag-and-drop dropzone
- [ ] Selected-file preview with filename and size
- [ ] Remove-file / replace-file affordance
- [ ] Client-side type validation (jpg/png/webp/pdf) error state
- [ ] Client-side size validation (e.g. <= 10 MB) error state
- [ ] Upload progress indicator
- [ ] Network-failure retry affordance
- [ ] Submit ("Send for review") primary CTA — disabled until a valid file is selected
- [ ] Back-to-instructions secondary CTA
- [ ] Success state → automatic navigation to step 4
- [ ] State when the subscription is already `pending_review`, `active`, or `cancelled` (block re-upload or allow a "replace proof" path)
- [ ] Server-rejected file error state (failed MIME sniff, infected, oversize)

**Gaps & risks**
- Client-side validation alone is insufficient — must be re-enforced server-side and at the Storage bucket policy.
- Uploads should go through a server function that mints a short-lived signed upload URL rather than allowing the client to write directly with the publishable key.
- On success, the subscription status transition AND the dashboard query cache invalidation must both happen — missing either causes "where is my store?" confusion (see Screen 23 deep-dive).
- EXIF/PII is not stripped from uploaded images.
- No MIME sniffing on the server (client-declared type can lie).
- No idempotency on re-upload — re-submitting can create duplicate `payment_proofs` rows.
- Error copy collapses oversize / wrong-type / network / status-mismatch into one generic toast.

**World-class targets**
- Server-minted signed upload URLs with content-type + size constraints baked in.
- Server-side MIME sniffing on the persisted object before the status transition is committed.
- Atomic transition: file persisted + `payment_proofs` row inserted + subscription status updated, in one transaction or guarded state machine.
- Idempotent re-upload that replaces the prior proof rather than duplicating it.
- Explicit, copy-tailored error states for every failure mode.

---

## 2. Performance & Speed

- Direct upload to Storage (via signed URL) keeps the file off the Worker; only metadata round-trips through the server function.
- Show real upload progress; never block the UI on a spinner-without-progress.
- Strip EXIF and downscale very large images client-side (best-effort) before upload to save bandwidth.
- Reserve dropzone dimensions so the preview thumbnail does not cause CLS.

---

## 3. Backend & Cloudflare/Supabase Compliance

- Storage bucket is private; access is via signed URLs only. RLS/storage policies enforce: object path includes the tenant id; only the tenant's members can read; only the owning user can write (and only once or with a controlled replace semantic).
- A server function (`requireSupabaseAuth`) handles: subscription status check → mint signed upload URL → confirm upload → server-side MIME sniff → insert `payment_proofs` row → transition subscription to `pending_review`.
- The transition is the **single write that must invalidate** the dashboard's `["my-tenants"]` and `["my-tenants-stats"]` query keys on the client when the mutation resolves. This is one of the four fix-surfaces for the dashboard render bug.
- Idempotency: re-uploads keyed by `subscription_id` (insert-or-replace), not append.
- Edge-safe: no Node-only deps; no `sharp`/`canvas` on the server. Any image transformation is best-effort client-side.
- Audit log entry on every successful proof submission (for the admin review screen).

---

## 4. Actionable Steps (production checklist)

1. - [ ] Replace direct-from-client uploads with a server-minted signed upload URL flow (content-type + max-size enforced server-side).
2. - [ ] Add server-side MIME sniffing on the persisted object before committing the status transition.
3. - [ ] Make the proof submission idempotent (insert-or-replace keyed by `subscription_id`).
4. - [ ] Atomically transition `subscriptions.status` to `pending_review` only after the proof row is persisted.
5. - [ ] Invalidate `["my-tenants"]` and `["my-tenants-stats"]` on mutation success (dashboard render-bug fix surface).
6. - [ ] Tighten Storage RLS: tenant-scoped object path, member-only read, controlled write/replace.
7. - [ ] Strip EXIF client-side for image uploads; downscale oversized images before upload.
8. - [ ] Add explicit, copy-tailored error states: wrong-type, oversize, network-failed, server-rejected, status-mismatch.
9. - [ ] Add a real upload progress indicator (not just a spinner).
10. - [ ] Block (or explicitly support) re-upload when the subscription is already `pending_review`/`active`/`cancelled`.
11. - [ ] Write an audit-log entry on every successful submission.
12. - [ ] Confirm the entire upload path is Worker-compatible (no Node-only deps).