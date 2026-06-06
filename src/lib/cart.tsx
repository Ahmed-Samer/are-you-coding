/**
 * Cart state + abandoned-cart session lifecycle.
 *
 *   1. CREATE  — `getCartSessionId(tenantId)` mints a UUID on first mount
 *                and persists to `localStorage` under `cart-session:<tid>`.
 *                Cart items persist under `cart:<tid>`.
 *   2. SYNC    — `useAbandonedCartSync` debounces 1.5s after any cart
 *                mutation, gated on `sessionId !== ""` and `!hydrating`.
 *                Only fires when the payload hash actually changed.
 *   3. RECOVER — `?recover=<token>` calls `getRecoveredCart`. The server
 *                returns the original `tenantId`; the Storefront hydrator
 *                rejects any mismatch (toast + strip param) so a recovery
 *                link can never leak items across tenants. On match we
 *                `replaceItems` + `adoptSessionId` + `setRecoveryToken`.
 *   4. CLEAR   — only on explicit user action: "Back to shopping" from the
 *                post-order confirmation, or a fresh checkout. The drawer
 *                NEVER silently empties the cart.
 *
 * Tenant isolation is enforced in three places:
 *   - Storage keys are namespaced by `tenantId`.
 *   - The CartProvider mount-time guard (below) wipes stale `cart:<tid>`
 *     entries whose matching `cart-session:<tid>` was cleared.
 *   - `getRecoveredCart` consumer validates `recovered.tenantId === tenant.id`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCartSessionId, setCartSessionId } from "./cart-session";

export type CartItem = {
  /** Stable composite identity: `${productId}|${variantId ?? ""}` */
  lineKey: string;
  productId: string;
  variantId: string | null;
  /** Human-readable variant summary, e.g. "Size: L · Color: Red". */
  variantLabel: string | null;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  quantity: number;
};

export function makeLineKey(productId: string, variantId?: string | null) {
  return `${productId}|${variantId ?? ""}`;
}

type AddInput = Omit<CartItem, "quantity" | "lineKey" | "variantId" | "variantLabel"> & {
  lineKey?: string;
  variantId?: string | null;
  variantLabel?: string | null;
};


type CartState = {
  items: CartItem[];
  add: (item: AddInput, qty?: number) => void;
  remove: (lineKey: string) => void;
  setQty: (lineKey: string, qty: number) => void;
  clear: () => void;
  replaceItems: (items: CartItem[]) => void;
  count: number;
  subtotalCents: number;
  // ----- Abandoned-cart recovery wiring -----
  /** Stable per-tenant opaque session id (UUID). Empty string during SSR. */
  sessionId: string;
  /** abandoned_carts.id once the first sync round-trips. Null until then. */
  recoveryCartId: string | null;
  setRecoveryCartId: (id: string | null) => void;
  /** Deep-link token captured from ?recover=… (if any), used for attribution. */
  recoveryToken: string | null;
  setRecoveryToken: (token: string | null) => void;
  /** Replace the persisted session id (called after deep-link hydration). */
  adoptSessionId: (sessionId: string) => void;
};

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const storageKey = `cart:${tenantId}`;
  const [items, setItems] = useState<CartItem[]>([]);
  // Resolve the session id once per tenant. SSR returns "" — the sync hook
  // skips when empty, and the value is filled in via the hydration effect.
  const [sessionId, setSessionId] = useState<string>("");
  const [recoveryCartId, setRecoveryCartId] = useState<string | null>(null);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(getCartSessionId(tenantId));
  }, [tenantId]);

  const adoptSessionId = useCallback((next: string) => {
    if (!next) return;
    setCartSessionId(tenantId, next);
    setSessionId(next);
  }, [tenantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Mount-time tenant-isolation guard: if the items blob exists but the
      // session id was cleared (e.g. user wiped storage partially, or a
      // previous tenant's data lingered), drop the stale items so they
      // can't leak into a different shopper's session.
      const sessionRaw = localStorage.getItem(`cart:session:${tenantId}`);
      const raw = localStorage.getItem(storageKey);
      if (raw && !sessionRaw) {
        localStorage.removeItem(storageKey);
        return;
      }
      if (raw) {
        const parsed = JSON.parse(raw) as any[];
        // Backfill lineKey for entries persisted before variants existed.
        const normalised: CartItem[] = parsed.map((it) => ({
          lineKey: it.lineKey ?? makeLineKey(it.productId, it.variantId),
          productId: it.productId,
          variantId: it.variantId ?? null,
          variantLabel: it.variantLabel ?? null,
          name: it.name,
          priceCents: it.priceCents,
          imageUrl: it.imageUrl ?? null,
          quantity: it.quantity,
        }));
        setItems(normalised);
      }
    } catch {}
  }, [storageKey, tenantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const value = useMemo<CartState>(() => ({
    items,
    add: (item, qty = 1) => {
      const key = item.lineKey ?? makeLineKey(item.productId, item.variantId);
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.lineKey === key);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty };
          return copy;
        }
        return [
          ...prev,
          {
            lineKey: key,
            productId: item.productId,
            variantId: item.variantId ?? null,
            variantLabel: item.variantLabel ?? null,
            name: item.name,
            priceCents: item.priceCents,
            imageUrl: item.imageUrl ?? null,
            quantity: qty,
          },
        ];
      });
    },
    remove: (lineKey) => setItems((prev) => prev.filter((p) => p.lineKey !== lineKey)),
    setQty: (lineKey, qty) =>
      setItems((prev) =>
        prev.map((p) => (p.lineKey === lineKey ? { ...p, quantity: Math.max(1, Math.min(999, qty)) } : p)),
      ),
    clear: () => setItems([]),
    replaceItems: (next) => setItems(next),
    count: items.reduce((s, i) => s + i.quantity, 0),
    subtotalCents: items.reduce((s, i) => s + i.priceCents * i.quantity, 0),
    sessionId,
    recoveryCartId,
    setRecoveryCartId,
    recoveryToken,
    setRecoveryToken,
    adoptSessionId,
  }), [items, sessionId, recoveryCartId, recoveryToken, adoptSessionId]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

/**
 * Format an integer minor-unit price (cents/piastres) as a localized string
 * with currency suffix. ALWAYS pass integer cents — never a float currency
 * amount, or you'll get a silent 100× discrepancy.
 *
 *   formatPrice(12345, "EGP") // "123.45 EGP"
 *   formatPrice(0,     "USD") // "0.00 USD"
 *   formatPrice(NaN,   "EGP") // "— EGP"   (guarded)
 */
export function formatPrice(cents: number, currency = "EGP") {
  if (!Number.isFinite(cents)) return `— ${currency}`;
  const value = (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value} ${currency}`;
}
