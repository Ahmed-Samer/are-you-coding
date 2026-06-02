# 09 — Admin Payments (Proof Review & Approval) Roadmap

The critical revenue gate. Admins review tenant-uploaded payment proofs and approve, reject, or request re-upload. Approving a tenant transitions them from `pending` to `active`, makes their storefront live, and triggers the welcome email.

## UX & Core Features
- [ ] Queue table: tenant, plan, amount, proof preview, uploaded-at, status
- [ ] Proof image/PDF preview drawer with zoom
- [ ] Action buttons: Approve, Reject (with reason), Request re-upload
- [ ] Confirmation dialog before Approve / Reject — destructive variant
- [ ] Re-auth prompt before Approve when configured
- [ ] Status filter (`pending` / `review` / `approved` / `rejected`)
- [ ] Search by tenant name / email / reference code
- [ ] Audit trail panel showing previous reviewers' decisions
- [ ] Toast on success; banner on failure with retry
- [ ] Bulk approve disabled by default (single-record discipline)

## Performance & Speed
- Server-side pagination + filter; queue never loads full history.
- Proof previews fetched via signed URLs with short TTL — not embedded as base64.
- Approval mutation is idempotent: re-clicking does not double-fire status transitions or duplicate emails.

## Backend & Cloudflare/Supabase Compliance
- **Approval flow (one server fn, transactional):**
  1. Verify caller `requireSupabaseAuth` + `has_role('admin')`.
  2. Load proof + tenant row, assert status is `pending|review`.
  3. Transition tenant status to `active`, set `activated_at`, set subscription `current_period_*`.
  4. Write audit row with full diff, actor, IP, UA.
  5. Purge storefront edge cache for that tenant slug (and `["my-tenants"]` query family server-side via response signal so the owner's dashboard refreshes).
  6. Enqueue Resend approval email using idempotency key `tenant_id + 'approval' + activated_at`.
  7. All steps wrapped so failure of (6) does not roll back (1–5); failure of (3) rolls back everything.
- Service-role client used only inside this server fn; never imported on client.
- Rejection writes audit + Resend rejection email with reason; tenant status returns to `pending` with rejection note.
- Signed-URL proof access scoped to admin reviewers; URLs expire ≤5 min.
- Re-auth gate (recent-login check) enforced server-side, not just UI.

## Actionable Steps
- [ ] 1. Implement `approveTenantProof` server fn with the full transactional flow above
- [ ] 2. Add idempotency key on the Resend dispatch to prevent duplicate welcome emails
- [ ] 3. Add edge-cache purge for the storefront slug on approval/rejection
- [ ] 4. Signal `["my-tenants"]` query invalidation so the owner's dashboard updates (fixes Phase-03 bug)
- [ ] 5. Enforce server-side recent-login re-auth check before Approve
- [ ] 6. Switch proof previews to short-TTL signed URLs
- [ ] 7. Add audit-trail panel showing previous decisions per tenant
- [ ] 8. Add tests: "double-click Approve → one status change, one audit row, one email"
- [ ] 9. Add tests: "Reject → tenant returned to pending with reason, no storefront activation"
- [ ] 10. Verify non-admin users get 401 on every payment server fn