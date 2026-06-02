
# Execution Plan — Screen 21: Checkout Upload Proof

Implements every gap, risk, and actionable step from `road-map-users-03/21_CHECKOUT_UPLOAD_PROOF_ROADMAP.md`. Auto-execute on approval.

## A. Database & Storage (append to `PENDING_SQL_COMMANDS.sql`)

- [ ] Create private Storage bucket `payment-proofs` (10 MB limit, allowed MIME: jpg/png/webp/pdf) via `supabase--storage_create_bucket` (NOT raw SQL on `storage.buckets`)
- [ ] Append RLS policies on `storage.objects` for bucket `payment-proofs`:
  - [ ] Path convention enforced: `{tenant_id}/{subscription_id}/proof.{ext}`
  - [ ] INSERT/UPDATE/DELETE: only the subscription owner (`subscriptions.user_id = auth.uid()` joined via path segment) may write
  - [ ] SELECT: tenant members (`tenant_members.user_id = auth.uid()`) OR `has_role(auth.uid(),'admin')`
  - [ ] No anon access
- [ ] Append table change: `ALTER TABLE public.payment_proofs ADD CONSTRAINT payment_proofs_subscription_unique UNIQUE (subscription_id);` (enables insert-or-replace idempotency)
- [ ] Append columns if missing: `mime_type text`, `byte_size bigint`, `storage_path text NOT NULL`, `sha256 text`, `submitted_at timestamptz default now()`
- [ ] Append `CHECK (status IN ('pending_payment','pending_review','active','cancelled','rejected'))` guard on `subscriptions.status` if not present
- [ ] Append `GRANT SELECT, INSERT, UPDATE ON public.payment_proofs TO authenticated; GRANT ALL TO service_role;`
- [ ] Append SQL function `public.transition_subscription_to_review(p_subscription_id uuid, p_proof jsonb)` — SECURITY DEFINER, atomic upsert of `payment_proofs` + status transition gated by current status in (`pending_payment`,`pending_review`), with audit_log insert
- [ ] Append audit_log row shape: `actor_id, tenant_id, subscription_id, action='proof.submitted', metadata jsonb`

## B. Server Functions (`src/lib/checkout-proof.functions.ts`)

- [ ] `createProofUploadUrl` — `requireSupabaseAuth`; validates subscription ownership + status; mints `createSignedUploadUrl` for path `{tenant_id}/{subscription_id}/proof-{ts}.{ext}`; returns `{ uploadUrl, token, storagePath }`
- [ ] `finalizeProofUpload` — `requireSupabaseAuth`; downloads first 4 KB of the object via `supabaseAdmin` (lazy import inside handler), runs server-side MIME sniff (magic bytes for JPEG/PNG/WEBP/PDF — pure JS, Worker-safe), rejects mismatch (deletes object), computes sha256 via WebCrypto, calls `transition_subscription_to_review` RPC, writes audit log, returns updated subscription
- [ ] Zod validators on every input (`subscriptionId` uuid, `storagePath` regex match)
- [ ] Idempotency: re-finalize with same `subscription_id` UPSERTs the proof row and re-emits the transition (no duplicate audit — guard by `(subscription_id, action, storage_path)` uniqueness)
- [ ] No Node-only deps; uses `crypto.subtle` + `Uint8Array` only

## C. Client UI (`src/routes/_authenticated/checkout.$subscriptionId.tsx` + new `src/components/checkout/UploadProofStep.tsx`)

- [ ] Dropzone (drag-and-drop + file input) with reserved dimensions (no CLS)
- [ ] Client validation: MIME in `[image/jpeg,image/png,image/webp,application/pdf]`, size ≤ 10 MB
- [ ] EXIF strip + downscale (>2000px longest edge) using `<canvas>` for images; PDFs pass through
- [ ] Selected-file preview (thumbnail for images, icon+filename for PDF), Remove/Replace buttons
- [ ] Real upload progress via `XMLHttpRequest` PUT to signed URL (fetch lacks progress)
- [ ] Submit CTA disabled until valid file; "Back to instructions" secondary CTA
- [ ] Distinct error copy per failure: `wrong-type`, `oversize`, `network-failed`, `server-rejected`, `status-mismatch`, `infected/mime-mismatch`
- [ ] Retry affordance on network failure (keeps file selected)
- [ ] On `finalizeProofUpload` success: `queryClient.invalidateQueries({ queryKey: ['my-tenants'] })` AND `['my-tenants-stats']`; then `navigate({ to: '/checkout/$subscriptionId', search: { step: 4 } })` (Screen 22)
- [ ] Block/replace UX: if status is `pending_review` → show "Replace proof" affordance; if `active`/`cancelled` → render read-only state with link to dashboard/store

## D. Cache & Routing

- [ ] Mutation `onSuccess` invalidates `['my-tenants']`, `['my-tenants-stats']`, `['subscription', subscriptionId]`
- [ ] Router navigation to Screen 22 (`pending-approval`) on success
- [ ] Optimistic status flip in `['subscription', subscriptionId]` cache (rollback on error)

## E. Tests

- [ ] Update `src/routes/_authenticated/__tests__/checkout.test.tsx`:
  - [ ] Renders dropzone, blocks invalid type/size with distinct copy
  - [ ] Submit calls `createProofUploadUrl` → PUT → `finalizeProofUpload`
  - [ ] On success invalidates `['my-tenants']` + `['my-tenants-stats']` and navigates to step 4
  - [ ] Re-upload UPSERTs (no duplicate row)
  - [ ] Status mismatch shows status-mismatch copy

## F. Worker Compatibility Verification

- [ ] No `sharp`/`canvas`/`fs.watch`/`child_process` imports
- [ ] MIME sniff uses pure-JS magic-byte check
- [ ] sha256 via `crypto.subtle.digest`
- [ ] Confirm `@supabase/supabase-js` `createSignedUploadUrl` + `download` are Worker-safe (they are — fetch-based)

## G. Roadmap Bookkeeping

- [ ] Mark every checkbox in `road-map-users-03/21_CHECKOUT_UPLOAD_PROOF_ROADMAP.md` as `[x]` after implementation
- [ ] Append a short "Implemented" note at bottom of the roadmap with the new files added

## Files to be created/modified

```text
PENDING_SQL_COMMANDS.sql                                  (append)
src/lib/checkout-proof.functions.ts                       (new)
src/lib/checkout-proof.server.ts                          (new — MIME sniff, sha256 helpers)
src/components/checkout/UploadProofStep.tsx               (new)
src/routes/_authenticated/checkout.$subscriptionId.tsx    (wire step 3)
src/routes/_authenticated/__tests__/checkout.test.tsx     (extend)
road-map-users-03/21_CHECKOUT_UPLOAD_PROOF_ROADMAP.md     (check off)
```

Approve to switch to build mode and execute end-to-end.
