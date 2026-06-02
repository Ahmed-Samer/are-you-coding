import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { CartProvider, useCart } from "@/lib/cart";
import { CartDrawer } from "@/components/storefront/CartDrawer";

// --- Mocks --------------------------------------------------------------

// Server functions are mocked at module level — useServerFn returns these as-is.
vi.mock("@/lib/catalog.functions", () => ({
  validatePromo: vi.fn(),
  createOrder: vi.fn(),
}));

// useServerFn just hands back the (mocked) fn so the component calls it directly.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

// Silence toasts in test output.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { validatePromo, createOrder } from "@/lib/catalog.functions";

// --- Helpers ------------------------------------------------------------

const TENANT_ID = "tenant-xyz";
const TENANT_WHATSAPP = "+201001234567";

function Seeder() {
  const cart = useCart();
  useEffect(() => {
    if (cart.items.length === 0) {
      cart.add({
        productId: "p-1",
        name: "Espresso Beans",
        priceCents: 15000,
        imageUrl: null,
      }, 2);
      cart.add({
        productId: "p-2",
        variantId: "v-l",
        variantLabel: "Size: L",
        name: "Latte",
        priceCents: 7500,
        imageUrl: null,
      }, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Harness({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <CartProvider tenantId={TENANT_ID}>
        <Seeder />
        {children}
      </CartProvider>
    </QueryClientProvider>
  );
}

function renderDrawer() {
  return render(
    <Harness>
      <CartDrawer
        open={true}
        onOpenChange={() => {}}
        tenantId={TENANT_ID}
        tenantName="Acme Coffee"
        currency="EGP"
        accent={null}
        tenantWhatsapp={TENANT_WHATSAPP}
      />
    </Harness>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// --- Tests --------------------------------------------------------------

describe("CartDrawer", () => {
  it("renders seeded cart items with line totals and subtotal", async () => {
    renderDrawer();
    expect(await screen.findByText("Espresso Beans")).toBeInTheDocument();
    expect(screen.getByText("Latte")).toBeInTheDocument();
    expect(screen.getByText("Size: L")).toBeInTheDocument();
    // subtotal = 15000*2 + 7500*1 = 37500 cents = 375.00 EGP
    expect(screen.getAllByText("375.00 EGP").length).toBeGreaterThan(0);
  });

  it("applies a valid promo code and shows discount line + new total", async () => {
    const user = userEvent.setup();
    (validatePromo as any).mockResolvedValue({
      ok: true,
      code: "SAVE10",
      discountCents: 5000,
    });

    renderDrawer();

    // Go to checkout stage where promo input lives
    await user.click(await screen.findByRole("button", { name: /^checkout$/i }));

    const promoInput = await screen.findByLabelText(/promo code/i);
    await user.type(promoInput, "save10");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(validatePromo).toHaveBeenCalledWith({
        data: { tenantId: TENANT_ID, code: "SAVE10", subtotalCents: 37500 },
      });
    });

    // Discount row appears (rendered in both the totals box and the applied-promo chip)
    expect(await screen.findByText(/Promo — SAVE10/)).toBeInTheDocument();
    expect(screen.getAllByText("− 50.00 EGP").length).toBeGreaterThanOrEqual(1);
    // New total: 37500 - 5000 + 0 (pickup) = 32500 = 325.00 EGP
    expect(screen.getByText("325.00 EGP")).toBeInTheDocument();
  });

  it("submits checkout and opens wa.me URL with promo + discount in message", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    (validatePromo as any).mockResolvedValue({
      ok: true,
      code: "SAVE10",
      discountCents: 5000,
    });
    (createOrder as any).mockResolvedValue({
      orderId: "order-abcdef12",
      subtotalCents: 37500,
      discountCents: 5000,
      promoCode: "SAVE10",
      currency: "EGP",
      whatsappE164: TENANT_WHATSAPP,
    });

    renderDrawer();

    await user.click(await screen.findByRole("button", { name: /^checkout$/i }));

    // Fill the form
    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/phone/i), "+201001234567");

    // Apply promo
    await user.type(screen.getByLabelText(/promo code/i), "SAVE10");
    await user.click(screen.getByRole("button", { name: /apply/i }));
    await screen.findByText(/Promo — SAVE10/);

    // Move to review
    await user.click(screen.getByRole("button", { name: /review order/i }));

    // Send order — opens ConfirmDialog
    await user.click(await screen.findByRole("button", { name: /send order via whatsapp/i }));

    // Confirm in dialog
    const confirmBtn = await screen.findByRole("button", { name: /send via whatsapp/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));

    const callArg = (createOrder as any).mock.calls[0][0];
    expect(callArg.data).toMatchObject({
      tenantId: TENANT_ID,
      customerName: "Jane Doe",
      customerPhone: "+201001234567",
      promoCode: "SAVE10",
    });
    expect(callArg.data.items).toHaveLength(2);
    expect(callArg.data.items[0]).toMatchObject({
      productId: "p-1",
      quantity: 2,
      priceCents: 15000,
    });

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    const [url, target] = openSpy.mock.calls[0];
    expect(target).toBe("_blank");
    expect(url).toMatch(/^https:\/\/wa\.me\/201001234567\?text=/);

    const decoded = decodeURIComponent(String(url).split("?text=")[1]);
    expect(decoded).toContain("Acme Coffee");
    expect(decoded).toContain("Order #ORDER-AB");
    expect(decoded).toContain("Jane Doe");
    expect(decoded).toContain("+201001234567");
    expect(decoded).toContain("2× Espresso Beans");
    expect(decoded).toContain("1× Latte");
    expect(decoded).toContain("Subtotal: 375.00 EGP");
    expect(decoded).toContain("Promo (SAVE10): − 50.00 EGP");
    expect(decoded).toContain("Delivery: Free");
    expect(decoded).toContain("*Total:* 325.00 EGP");

    openSpy.mockRestore();
  });
});
