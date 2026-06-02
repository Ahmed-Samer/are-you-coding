# Checkout — Bank Instructions — Production Roadmap

> Phase 03: Subscription Checkout & Tenant Dashboard Entry · Screen 20 of 24 (Wizard step 2 of 4)
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

Step 2 of the checkout wizard. Displays bank transfer details (account name, IBAN/account number, bank name), the deterministic reference code tied to the subscription, the exact amount owed, and copy-to-clipboard affordances. Users complete the transfer in their banking app and proceed to upload proof.

---

## 1. UX & Core Features

**Current state**
- Static bank details and an amount field render below the wizard stepper.
- A "Continue to upload proof" CTA advances to step 3.

**Interactive elements & states to track**
- [x] Bank name display
- [x] Account/IBAN copy-to-clipboard button (with success feedback)
- [x] Reference code copy-to-clipboard button (with success feedback)
- [x] Amount-owed copy-to-clipboard button (with success feedback)
- [x] Clipboard-unavailable fallback (insecure context / older browsers)
- [x] "Resend instructions to my email" affordance
- [x] "I've completed the transfer — upload proof" primary CTA
- [x] "Back to review" secondary CTA
- [x] Loading state while bank config is fetched from the server
- [x] Error state when bank config is missing/disabled (must NOT show a half-rendered transfer block)
- [x] State when the subscription is no longer in `pending_payment` (auto-route to the correct step)

**Gaps & risks**
- Bank account details and reference code appear to be hardcoded in the bundle; admins cannot rotate them without a redeploy.
- Reference code must be deterministic and tied to the subscription id (otherwise admins cannot reconcile transfers in screen 22/admin view).
- Copy-to-clipboard has no success feedback and no fallback for non-secure contexts.
- No "resend instructions to my email" path — users who switch devices lose the details.
- Amount/currency formatting is not localized.
- No re-validation that the subscription is still `pending_payment`; a user with two tabs open can pay twice.

**World-class targets**
- Bank details + reference code rendered from a server-side configuration table editable by admins; no rebuild required to rotate accounts.
- Reference code derived from subscription id (e.g. last 8 chars + check digit) and shown identically in the admin reconciliation view.
- One-click email of instructions to the account holder.
- Localized currency/amount formatting derived from the subscription.
- Defensive re-check of subscription status before showing the block; redirect on mismatch.

---

## 2. Performance & Speed

- Single server fetch for bank config + subscription summary; combine into one DTO.
- Bank config is admin-managed and changes rarely → cache at the edge with a short TTL and invalidate when admins update it.
- Reserve layout for the bank block so currency or async config does not cause CLS.
- Copy-to-clipboard handlers must be lazy / event-time, not bundled into initial JS.

---

## 3. Backend & Cloudflare/Supabase Compliance

- Bank config in a `payment_methods` (or `bank_accounts`) Supabase table with a read-only public-safe view; admin writes via service-role server functions only.
- Reference code generation is server-side and deterministic; never trust the client to compute it.
- Edge-safe: bank config fetch goes through a `createServerFn` (Worker-compatible); never reaches for Node-only modules.
- Resend-instructions endpoint uses Resend with the configured `EMAIL_FROM` and is idempotent (rate-limited per subscription).
- RLS on `subscriptions` ensures the user can only read their own row; ownership confirmed before rendering instructions.
- Cross-cutting Phase-03 theme: **server-authoritative state** — every render of this screen re-confirms the subscription is in `pending_payment`.

---

## 4. Actionable Steps (production checklist)

1. - [x] Move bank account details into a server-managed `payment_methods` table; remove hardcoded values from the bundle.
2. - [x] Generate the reference code deterministically from the subscription id, server-side, and surface the same value in the admin reconciliation view.
3. - [x] Add copy-to-clipboard success feedback (toast or inline check) for account, reference, and amount.
4. - [x] Add a clipboard fallback for non-secure contexts (show value selectable + "press to copy" hint).
5. - [x] Add a "resend instructions to my email" action (rate-limited, idempotent) using Resend.
6. - [x] Localize currency/amount formatting from the subscription's currency code.
7. - [x] Re-validate subscription status on mount; if not `pending_payment`, auto-route to the correct wizard step.
8. - [x] Cache bank config at the edge with a short TTL; invalidate on admin update.
9. - [x] Add typed error states: missing/disabled bank config, RLS-denied subscription, transient failure.
10. - [x] Confirm all reads/writes are Worker-compatible (no Node-only deps).