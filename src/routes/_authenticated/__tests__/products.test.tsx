import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks --------------------------------------------------------------

const TENANT = { id: "tenant-1", slug: "acme", name: "Acme", currency: "EGP", low_stock_threshold: 5 };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => ({ ...config }),
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

vi.mock("@/routes/_authenticated/store.$slug", () => ({
  useStore: () => ({ tenant: TENANT }),
}));

const supabaseStub = vi.hoisted(() => ({
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example/image.jpg" } }),
    }),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseStub }));

vi.mock("@/lib/catalog.functions", () => ({
  listMyProducts: vi.fn(),
  listMyCategories: vi.fn(),
  upsertProduct: vi.fn(),
  deleteProduct: vi.fn(),
  bulkProductAction: vi.fn(),
  exportProductsCsv: vi.fn(),
  importProductsCsv: vi.fn(),
}));

import { ProductsPage } from "@/routes/_authenticated/store.$slug.products";
import {
  listMyProducts, listMyCategories, upsertProduct, deleteProduct, importProductsCsv,
} from "@/lib/catalog.functions";

// --- Helpers ------------------------------------------------------------

const PRODUCTS = {
  products: [
    {
      id: "p-1", name: "Espresso Beans", sku: "ESP-001", description: "Dark roast",
      price_cents: 15000, currency: "EGP", stock: 20, image_url: null,
      is_active: true, category_id: null, sort_order: 0, updated_at: "2025-01-01T00:00:00Z",
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (listMyProducts as any).mockResolvedValue(PRODUCTS);
  (listMyCategories as any).mockResolvedValue({ categories: [] });
  (upsertProduct as any).mockResolvedValue({ id: "p-new" });
  (deleteProduct as any).mockResolvedValue({ ok: true });
});

// --- Tests --------------------------------------------------------------

describe("ProductsPage", () => {
  it("renders the products list", async () => {
    renderPage();
    expect((await screen.findAllByText("Espresso Beans")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ESP-001").length).toBeGreaterThan(0);
  });

  it("creates a product with an uploaded image", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("Espresso Beans");

    await user.click(screen.getByRole("button", { name: /new product/i }));

    const dialog = await screen.findByRole("dialog");
    const inputs = dialog.querySelectorAll('input:not([type="file"])');
    // Order: Name, SKU, Price, Stock (Switch is a button, not input)
    const [nameInput, skuInput, priceInput, stockInput] = Array.from(inputs) as HTMLInputElement[];
    await user.type(nameInput, "Latte Mix");
    await user.type(skuInput, "LAT-001");
    await user.clear(priceInput);
    await user.type(priceInput, "75");
    await user.clear(stockInput);
    await user.type(stockInput, "12");

    // Upload image
    const file = new File(["x"], "img.png", { type: "image/png" });
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(supabaseStub.storage.from).toHaveBeenCalledWith("tenant-assets");
    });

    await user.click(within(dialog).getByRole("button", { name: /save product/i }));

    await waitFor(() => {
      expect(upsertProduct).toHaveBeenCalled();
    });
    const payload = (upsertProduct as any).mock.calls[0][0].data;
    expect(payload).toMatchObject({
      tenantId: "tenant-1",
      name: "Latte Mix",
      sku: "LAT-001",
      priceCents: 7500,
      stock: 12,
      imageUrl: "https://cdn.example/image.jpg",
      isActive: true,
    });
  });

  it("deletes a product after confirmation", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("Espresso Beans");

    // Row delete button (table is hidden on mobile via .md:table; test env has no CSS so both render — pick first)
    const deleteBtns = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteBtns[0]);

    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(deleteProduct).toHaveBeenCalledWith({ data: { tenantId: "tenant-1", id: "p-1" } });
    });
  });

  it("runs CSV import dry-run preview then applies the batch", async () => {
    const user = userEvent.setup();
    const dryResult = {
      total: 2, inserts: 1, updates: 1, errors: [],
      preview: [
        { row: 2, action: "insert", name: "New One", sku: "N-1", error: null },
        { row: 3, action: "update", name: "Espresso Beans", sku: "ESP-001", error: null },
      ],
    };
    (importProductsCsv as any)
      .mockResolvedValueOnce(dryResult) // dry-run
      .mockResolvedValueOnce({ inserts: 1, updates: 1, errors: [] }); // apply

    renderPage();
    await screen.findAllByText("Espresso Beans");
    await user.click(screen.getByRole("button", { name: /import csv/i }));

    const dialog = await screen.findByRole("dialog");
    const csv = "name,sku,price,stock\nNew One,N-1,10,5\nEspresso Beans,ESP-001,150,20\n";
    const file = new File([csv], "products.csv", { type: "text/csv" });
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    // Dry-run preview shown
    await screen.findByText(/Total: 2/);
    expect(screen.getByText(/Insert: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Update: 1/)).toBeInTheDocument();
    expect(importProductsCsv).toHaveBeenNthCalledWith(1, {
      data: { tenantId: "tenant-1", csv, dryRun: true },
    });

    // Apply
    await user.click(screen.getByRole("button", { name: /import 2 rows/i }));
    await waitFor(() => {
      expect(importProductsCsv).toHaveBeenNthCalledWith(2, {
        data: { tenantId: "tenant-1", csv, dryRun: false },
      });
    });
  });
});
