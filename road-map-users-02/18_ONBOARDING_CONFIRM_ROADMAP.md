# Onboarding — Confirm — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 18 of 18 (Wizard step 4 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

Step 4 of the wizard: review the full summary (name, address, industry, template, plan) then create the tenant + subscription and hand off to the checkout wizard. This is the commit point where all prior draft state becomes real, persisted records.

---

## 1. UX & Core Features

**Current state**
- A clear summary list reflects every prior choice before commit.
- On confirm, a single server call creates the tenant + subscription, clears the localStorage draft, invalidates tenant-list/stats queries, toasts success, and navigates to checkout with the returned subscription id.
- A busy flag is set during creation; a "Save & exit" path lets users leave and resume later.

**Gaps & risks**
- **This is the first point slug uniqueness is enforced** — a collision (or any validation failure) surfaces as a generic error toast rather than routing the user back to the relevant step (Basics) with the field highlighted. Late, low-context failure.
- **Double-submit risk**: the busy flag guards the button, but a true idempotency guard (e.g. an idempotency key or unique constraint handling) is needed so a retried/duplicated request can't create two tenants/subscriptions.
- **Draft is cleared before navigation completes** — if the post-create navigation to checkout fails, the draft is already gone, stranding the user with a created-but-unreached store.
- **No confirm-time revalidation** that the chosen template/plan are still available (drafts can be stale).
- The summary's address/currency formatting is hardcoded, mirroring earlier steps.

**World-class targets**
- Validation failures (especially slug collision) routed back to the owning step with the exact field flagged.
- Idempotent creation that cannot produce duplicate tenants/subscriptions on retry.
- Draft cleared only after a confirmed successful handoff to checkout.
- Confirm-time revalidation of template + plan availability.

---

## 2. Performance & Speed

- The confirm step is light; the only cost is the create mutation. Keep it that way.
- Scope post-create cache invalidation to tenant-list/stats keys (it does) — avoid a global invalidation.
- Ensure the success → checkout navigation is immediate and the subscription id is passed reliably so the next wizard loads without a refetch round-trip.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Creation must be atomic and server-authoritative**: tenant + subscription created together, with slug uniqueness enforced by a DB unique constraint (closing the check-then-create race from the Basics step's advisory check).
- **Map server validation errors to specific steps/fields** in the response so the UI can route back precisely (slug taken → Basics; invalid plan → Plan; invalid template → Template).
- **Revalidate slug, plan slug + interval, and template id server-side** at create time — never trust the restored draft.
- **Idempotency**: support an idempotency key (or detect-and-return existing) so a network retry doesn't double-create.
- The handoff to checkout must carry the subscription id and be edge-safe (no Node-only deps); the created records must persist so checkout can resume independently of client draft state.

---

## 4. Actionable Steps (production checklist)

1. [x] Map create-time validation errors to the owning step and field (slug → Basics, plan → Plan, template → Template) instead of a generic toast.
2. [x] Make creation idempotent (idempotency key or detect-and-return) to prevent duplicate tenant/subscription on retry.
3. [x] Enforce slug uniqueness atomically via a DB unique constraint (advisory check stays in Basics).
4. [x] Clear the localStorage draft only after a confirmed successful handoff to checkout.
5. [x] Revalidate slug, plan slug + interval, and template id server-side at create time.
6. [x] Keep post-create invalidation scoped to tenant-list/stats keys.
7. [x] Format address/currency from configuration rather than hardcoded strings.
8. [x] Ensure the checkout handoff reliably carries the subscription id and is edge-safe; persisted records must let checkout resume without client draft.

