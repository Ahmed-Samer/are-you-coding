import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Mocks --------------------------------------------------------------

const TENANT = { id: "tenant-1", slug: "acme", name: "Acme", currency: "EGP" };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => ({ ...config }),
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
  useParams: () => ({ slug: "acme" }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/routes/_authenticated/store.$slug", () => ({
  useStore: () => ({ tenant: TENANT }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example/c.jpg" } }),
      }),
    },
  },
}));

vi.mock("@/lib/catalog.functions", () => ({
  listMyCategories: vi.fn(),
  upsertCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategories: vi.fn(),
}));

import { CategoriesPage } from "@/routes/_authenticated/store.$slug.categories";
import {
  listMyCategories, upsertCategory, deleteCategory, reorderCategories,
} from "@/lib/catalog.functions";

const ROOT = {
  id: "cat-root", name: "Beverages", slug: "beverages",
  parent_id: null, path: "cat-root", cover_image_url: null, sort_order: 0,
};
const CHILD = {
  id: "cat-child", name: "Hot Drinks", slug: "hot-drinks",
  parent_id: "cat-root", path: "cat-root/cat-child", cover_image_url: null, sort_order: 1,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CategoriesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (listMyCategories as any).mockResolvedValue({ categories: [ROOT, CHILD] });
  (upsertCategory as any).mockResolvedValue({ id: "cat-new" });
  (deleteCategory as any).mockResolvedValue({ ok: true });
  (reorderCategories as any).mockResolvedValue({ ok: true });
});

describe("CategoriesPage", () => {
  it("renders root and nested categories", async () => {
    renderPage();
    expect(await screen.findByText("Beverages")).toBeInTheDocument();
    expect(screen.getByText("Hot Drinks")).toBeInTheDocument();
  });

  it("creates a root-level category (parentId: null)", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Beverages");

    await user.click(screen.getByRole("button", { name: /new category/i }));
    const dialog = await screen.findByRole("dialog");

    const nameInput = within(dialog).getByLabelText(/name/i);
    await user.type(nameInput, "Snacks");

    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(upsertCategory).toHaveBeenCalled());
    const payload = (upsertCategory as any).mock.calls[0][0].data;
    expect(payload).toMatchObject({
      tenantId: "tenant-1",
      name: "Snacks",
      parentId: null,
    });
  });

  it("creates a nested category under an existing parent", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Beverages");

    await user.click(screen.getByRole("button", { name: /new category/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/name/i), "Cold Drinks");

    const parentSelect = within(dialog).getByLabelText(/parent category/i) as HTMLSelectElement;
    await user.selectOptions(parentSelect, "cat-root");

    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(upsertCategory).toHaveBeenCalled());
    const payload = (upsertCategory as any).mock.calls[0][0].data;
    expect(payload).toMatchObject({
      tenantId: "tenant-1",
      name: "Cold Drinks",
      parentId: "cat-root",
    });
  });

  it("deletes a category after confirmation", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Beverages");

    const deleteBtns = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteBtns[0]);

    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(deleteCategory).toHaveBeenCalledWith({
        data: { tenantId: "tenant-1", id: "cat-root" },
      });
    });
  });
});
