import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks --------------------------------------------------------------

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config,
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

vi.mock("@/components/admin/AdminShell", () => ({
  AdminShell: ({ children, title, actions }: any) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/admin.functions", () => ({
  listPendingProofs: vi.fn(),
  reviewPaymentProof: vi.fn(),
}));

import { AdminPaymentsPage } from "@/routes/_authenticated/admin.payments";
import { listPendingProofs, reviewPaymentProof } from "@/lib/admin.functions";
import { toast } from "sonner";

// --- Fixture ------------------------------------------------------------

const PENDING_PROOF = {
  id: "proof-1",
  status: "pending" as const,
  amount_usd: 19,
  amount_egp: 921,
  reference_number: "TXN-982341",
  created_at: new Date().toISOString(),
  tenants: { name: "Acme Goods", slug: "acme" },
  payment_methods: { label: "Vodafone Cash", kind: "wallet" },
  account_subscriptions: { plans: { name: "Starter", interval: "monthly" } },
};

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Prime the cache so useSuspenseQuery resolves synchronously.
  qc.setQueryData(["admin", "proofs", "all"], { proofs: [PENDING_PROOF] });
  return render(
    <QueryClientProvider client={qc}>
      <AdminPaymentsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (listPendingProofs as any).mockResolvedValue({ proofs: [PENDING_PROOF] });
});

// --- Tests --------------------------------------------------------------

describe("Admin payments — approve pending proof", () => {
  it("renders the pending proof row", async () => {
    renderPage();
    expect(await screen.findByText("Acme Goods")).toBeInTheDocument();
    expect(screen.getByText("TXN-982341")).toBeInTheDocument();
    expect(screen.getAllByText(/^pending$/i).length).toBeGreaterThan(0);
  });

  it("opens the detail sheet and calls reviewPaymentProof when admin clicks Approve", async () => {
    const user = userEvent.setup();
    (reviewPaymentProof as any).mockResolvedValue({ ok: true });

    renderPage();

    // Open the side sheet by clicking the row
    await user.click(await screen.findByText("Acme Goods"));

    // Approve button appears inside the sheet for pending proofs
    const approveBtn = await screen.findByRole("button", { name: /approve \(a\)/i });
    await user.click(approveBtn);

    await waitFor(() => expect(reviewPaymentProof).toHaveBeenCalledTimes(1));
    expect(reviewPaymentProof).toHaveBeenCalledWith({
      data: {
        proofId: "proof-1",
        decision: "approved",
        reviewerNotes: undefined,
      },
    });

    await waitFor(() => expect((toast as any).success).toHaveBeenCalledWith("Proof approved"));
  });
});
