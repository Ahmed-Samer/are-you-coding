import { describe, it, expect } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { CartProvider, useCart, makeLineKey, formatPrice } from "@/lib/cart";
import type { ReactNode } from "react";

const TENANT = "tenant-1";

function wrapper({ children }: { children: ReactNode }) {
  return <CartProvider tenantId={TENANT}>{children}</CartProvider>;
}

const productA = {
  productId: "p-a",
  name: "Espresso Beans",
  priceCents: 15000,
  imageUrl: null,
};
const productB = {
  productId: "p-b",
  variantId: "v-large",
  variantLabel: "Size: Large",
  name: "Latte",
  priceCents: 7500,
  imageUrl: null,
};

describe("cart logic (storefront browse → drawer → checkout math)", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toHaveLength(0);
    expect(result.current.count).toBe(0);
    expect(result.current.subtotalCents).toBe(0);
  });

  it("adds a product (simulates ProductDrawer 'Add to cart')", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(productA));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.count).toBe(1);
    expect(result.current.subtotalCents).toBe(15000);
  });

  it("merges duplicate lines by composite lineKey (product + variant)", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.add(productA, 1);
      result.current.add(productA, 2);
      result.current.add(productB, 1);
    });
    expect(result.current.items).toHaveLength(2);
    const a = result.current.items.find(
      (i) => i.lineKey === makeLineKey(productA.productId, null),
    )!;
    expect(a.quantity).toBe(3);
    expect(result.current.subtotalCents).toBe(15000 * 3 + 7500);
  });

  it("setQty clamps to [1, 999] and recomputes subtotal — enables checkout button", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(productA));
    const key = result.current.items[0].lineKey;

    act(() => result.current.setQty(key, 4));
    expect(result.current.items[0].quantity).toBe(4);
    expect(result.current.subtotalCents).toBe(60000);

    act(() => result.current.setQty(key, 0));
    expect(result.current.items[0].quantity).toBe(1);

    act(() => result.current.setQty(key, 9999));
    expect(result.current.items[0].quantity).toBe(999);

    // Cart non-empty → CartDrawer Checkout button would be enabled.
    expect(result.current.items.length > 0).toBe(true);
  });

  it("remove and clear empty the cart (disables checkout)", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.add(productA);
      result.current.add(productB);
    });
    const keyA = makeLineKey(productA.productId, null);
    act(() => result.current.remove(keyA));
    expect(result.current.items).toHaveLength(1);

    act(() => result.current.clear());
    expect(result.current.items).toHaveLength(0);
    expect(result.current.subtotalCents).toBe(0);
  });

  it("persists per-tenant to localStorage and rehydrates", () => {
    const { result, unmount } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(productA, 2));
    unmount();

    const raw = localStorage.getItem(`cart:${TENANT}`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toHaveLength(1);

    const { result: result2 } = renderHook(() => useCart(), { wrapper });
    expect(result2.current.items).toHaveLength(1);
    expect(result2.current.items[0].quantity).toBe(2);
    expect(result2.current.subtotalCents).toBe(30000);
  });

  it("backfills lineKey for legacy persisted carts (pre-variant schema)", () => {
    localStorage.setItem(
      `cart:${TENANT}`,
      JSON.stringify([
        {
          productId: "legacy",
          name: "Old Item",
          priceCents: 1000,
          quantity: 2,
        },
      ]),
    );
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items[0].lineKey).toBe(makeLineKey("legacy", null));
    expect(result.current.subtotalCents).toBe(2000);
  });

  it("formatPrice renders cents with currency suffix", () => {
    expect(formatPrice(15000, "EGP")).toBe("150.00 EGP");
    expect(formatPrice(0, "USD")).toBe("0.00 USD");
  });

  it("formatPrice guards against non-finite input (no NaN crash)", () => {
    expect(formatPrice(Number.NaN, "EGP")).toBe("— EGP");
    expect(formatPrice(undefined as unknown as number, "USD")).toBe("— USD");
    expect(formatPrice(Infinity, "EGP")).toBe("— EGP");
  });

  it("formatPrice never silently rescales — integer cents stay integer cents", () => {
    // Regression guard: revenueWeekCents from getTenantStats is integer cents.
    // If a caller ever passes 12345 instead of 1234500, the rendered value
    // must visibly differ (no 100× confusion).
    expect(formatPrice(12345, "EGP")).toBe("123.45 EGP");
    expect(formatPrice(1234500, "EGP")).not.toBe(formatPrice(12345, "EGP"));
  });

  it("end-to-end: browse → add → bump qty → review totals → checkout enabled", () => {
    function Totals() {
      const cart = useCart();
      const checkoutDisabled = cart.items.length === 0;
      return (
        <div>
          <span data-testid="count">{cart.count}</span>
          <span data-testid="subtotal">{cart.subtotalCents}</span>
          <button data-testid="checkout" disabled={checkoutDisabled}>
            Checkout
          </button>
        </div>
      );
    }
    let api: ReturnType<typeof useCart> | null = null;
    function Capture() {
      api = useCart();
      return null;
    }
    const { getByTestId } = render(
      <CartProvider tenantId={TENANT}>
        <Capture />
        <Totals />
      </CartProvider>,
    );

    expect(getByTestId("checkout")).toBeDisabled();

    act(() => api!.add(productA));
    act(() => api!.add(productB, 2));
    const keyA = makeLineKey(productA.productId, null);
    act(() => api!.setQty(keyA, 3));

    // subtotal = 15000*3 + 7500*2 = 60000
    expect(getByTestId("subtotal").textContent).toBe("60000");
    expect(getByTestId("count").textContent).toBe("5");
    expect(getByTestId("checkout")).toBeEnabled();
  });
});
