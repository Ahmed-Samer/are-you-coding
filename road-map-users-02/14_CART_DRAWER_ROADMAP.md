# Cart Drawer — Production Roadmap

> Phase 02: Storefront & Onboarding Funnel · Screen 14 of 18
> Stack: Supabase (DB/Auth/backend logic) · Deployed on Cloudflare Pages (Workers/Edge runtime)

The cart and checkout slide-over: line items, promo codes, delivery zones, a customer-details form, an order review, and the structural handoff to WhatsApp. This is where revenue is realized, so correctness and edge-safety are paramount.

---

## 1. UX & Core Features

**Current state**
- Three clear stages: cart → checkout (details) → review, each with its own footer actions and a back path.
- Line item quantity controls, remove, subtotal, delivery-zone fees, and promo apply/clear with inline error messaging.
- Customer form uses schema validation with real phone validation (libphonenumber) and `onBlur` mode.
- Opt-in abandoned-cart contact attach fires on phone blur once consent is given.
- Order is created via a server function; the **WhatsApp message is built from the server's canonical order** (order id, subtotal, currency) and opened via a `wa.me` deep link. Closed-store / not-accepting-orders state disables checkout.

**Gaps & risks**
- **WhatsApp handoff via `window.open`** is an external structural step that must stay edge-safe and resilient: it already guards malformed/missing tenant numbers, but needs a clear fallback UI (copy link / show number) when the popup is blocked or the number is absent.
- **Total math is computed client-side** (subtotal − discount + delivery). The server already returns a canonical discount/subtotal — the UI should **always trust server values** for the final figure shown and sent, treating client math as an optimistic preview only.
- **Cart persistence lifecycle is under-documented**: a per-tenant localStorage session id plus a recovery token/id drive abandoned-cart sync and deep-link hydration. Tenant-mismatch is guarded on recovery, but the full lifecycle (create → sync → recover → clear) needs explicit documentation and guards against stale cross-tenant carts.
- **Review-stage layout** can shift as totals/promo rows appear; reserve space.
- After a successful send the cart clears and the drawer closes immediately — there is no persistent "order sent" confirmation the shopper can return to.

**World-class targets**
- Server-authoritative totals end-to-end (display and message) with client math as preview only.
- A robust WhatsApp handoff with copy-link/show-number fallback when `window.open` fails.
- A documented, guarded cart-session lifecycle that can never leak items across tenants.
- A persistent post-order confirmation state.

---

## 2. Performance & Speed

- Keep the cart drawer **code-split** from the storefront initial bundle; it loads form/validation libraries (react-hook-form, zod, libphonenumber) that should not be in first paint.
- **Debounce abandoned-cart sync** (already gated behind hydration) and ensure it never blocks interaction.
- Avoid re-validating the promo on every keystroke — validate on explicit apply only (current behavior) and cache the last result.
- Memoize line-item handlers (done) so the list doesn't re-render on unrelated cart updates.

---

## 3. Backend & Cloudflare/Supabase Compliance

- **Order creation, promo validation, and totals must be fully server-authoritative** — the client must not be able to inject a discount or price. Recompute subtotal/discount/total from server-trusted catalog + promo data and return canonical values (server already returns these; the UI must use them).
- **WhatsApp deep-link building must be pure/edge-safe** — no Node-only modules; `wa.me` URL construction and `window.open` are client-side and Worker-agnostic, which is correct.
- **Abandoned-cart writes** must be rate-limited and consent-gated server-side; the contact attach must verify consent server-side, not trust the client flag alone.
- **Promo and order endpoints** must validate tenant ownership and that the promo belongs to the tenant, under RLS / explicit tenant scoping.
- Persist the canonical order record so a recovery/confirmation can be re-fetched; never rely solely on client cart state.

---

## 4. Actionable Steps (production checklist)

1. Make the UI trust server-returned subtotal/discount/total for the final displayed and sent figures; treat client math as an optimistic preview only.
2. Add a WhatsApp handoff fallback (copy link / show number) for blocked popups or missing tenant numbers.
3. Document and guard the full cart-session lifecycle (create → sync → recover → clear); enforce tenant-mismatch rejection everywhere a cart is hydrated.
4. Add a persistent "order sent" confirmation state instead of silently closing the drawer.
5. Reserve space in the review stage to eliminate layout shift as promo/total rows appear.
6. Code-split the cart drawer (form + phone validation libs) out of first paint.
7. Enforce server-side consent verification and rate limiting on abandoned-cart contact attach.
8. Confirm order/promo endpoints validate tenant ownership and promo-to-tenant binding under RLS.
9. Keep all WhatsApp/`wa.me` link building pure and edge-safe (no Node-only deps).

---

## Status — Implemented 2026-06-02

- [x] 1. Trust server-returned subtotal/discount/total for displayed and sent figures — `createOrder` response now drives confirmation totals + WhatsApp message; client math labelled preview only (see CartDrawer.tsx header doc).
- [x] 2. WhatsApp handoff fallback — anchor (popup-block immune) + Copy link + click-to-call + "Copy order details" when tenant phone missing.
- [x] 3. Cart-session lifecycle documented + tenant-mismatch guards added (cart.tsx header; mount-time stale-blob wipe in CartProvider; explicit toast on `getRecoveredCart` mismatch in Storefront).
- [x] 4. Persistent "order sent" confirmation stage added; persists across drawer reopens via `sessionStorage` until "Back to shopping".
- [x] 5. Review-stage layout reservations (`min-h` on promo + validation-notice rows, `aria-live="polite"` on totals).
- [x] 6. Cart drawer kept code-split (Storefront lazy-loads CartDrawer; react-hook-form + zod + libphonenumber-js only land in that chunk).
- [x] 7. Server-side consent verification on `attachCartContact` (existing `consent: z.literal(true)` + `enforceRateLimit`) verified — no change required.
- [x] 8. Promo + order endpoint tenant-binding audited (`validatePromo` + `createOrder` already scope by `tenantId`) — no change required.
- [x] 9. WhatsApp `wa.me` URL builder is pure string + `encodeURIComponent`; no Node-only deps reachable from the Worker SSR runtime.

### Bonus (Gaps & risks)
- [x] URL-driven drawer state: `?cart=open` validated in `/` searchSchema; back button + reload now close/open the drawer correctly.
- [x] Server-authoritative cart validation via `validateCartLines` runs before `cart → checkout` and `checkout → review`; price/stock drift is auto-applied + announced via `role="status" aria-live="polite"` notice.

### SQL
No schema changes required. Audit note appended to `PENDING_SQL_COMMANDS.sql`.
