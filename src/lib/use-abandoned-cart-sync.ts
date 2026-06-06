import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncAbandonedCart } from "@/lib/abandoned-carts.functions";
import { useCart } from "@/lib/cart";

const DEBOUNCE_MS = 1500;

/**
 * Storefront-side abandoned-cart sync. Mount ONCE inside CartProvider at a
 * stable location (e.g. Storefront root). The cart drawer mounts/unmounts as
 * the user opens it — putting this hook there would tear down the debounce.
 *
 * Skips when:
 *   - SSR / session id not yet resolved
 *   - cart is empty AND has never synced (avoids creating empty rows)
 *   - payload hash hasn't changed since the last successful sync
 *   - the caller flags `hydrating` (deep-link hydration in progress)
 */
export function useAbandonedCartSync({
  tenantId,
  currency,
  promoCode,
  hydrating,
}: {
  tenantId: string;
  currency: string;
  promoCode?: string | null;
  hydrating?: boolean;
}) {
  const cart = useCart();
  const sync = useServerFn(syncAbandonedCart);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHashRef = useRef<string>("");
  const everSyncedRef = useRef<boolean>(false);

  useEffect(() => {
    if (hydrating) return;
    if (!cart.sessionId) return;
    if (cart.items.length === 0 && !everSyncedRef.current) return;

    // Stable hash of the payload that the server actually persists.
    const payload = {
      items: cart.items.map((i) => ({
        lineKey: i.lineKey,
        productId: i.productId,
        variantId: i.variantId ?? null,
        variantLabel: i.variantLabel ?? null,
        name: i.name,
        priceCents: i.priceCents,
        imageUrl: i.imageUrl ?? null,
        quantity: i.quantity,
      })),
      subtotalCents: cart.subtotalCents,
      currency,
      promoCode: promoCode ?? null,
    };
    const hash = JSON.stringify(payload);
    if (hash === lastHashRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await sync({
          data: {
            tenantId,
            sessionId: cart.sessionId,
            ...payload,
          },
        });
        lastHashRef.current = hash;
        everSyncedRef.current = true;
        if (res?.id && res.id !== cart.recoveryCartId) {
          cart.setRecoveryCartId(res.id);
        }
      } catch (e) {
        // Cart sync must never block the shopper.
        console.warn("[cart-sync] failed", (e as Error)?.message);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    hydrating,
    cart.sessionId,
    cart.items,
    cart.subtotalCents,
    cart.recoveryCartId,
    currency,
    promoCode,
    tenantId,
    sync,
  ]);
}