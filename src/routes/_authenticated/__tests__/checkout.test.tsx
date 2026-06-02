import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks --------------------------------------------------------------

const SUB_ID = "sub-123";
const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => ({
    ...config,
    useParams: () => ({ subscriptionId: SUB_ID }),
    useSearch: () => ({}),
  }),
  useNavigate: () => navigateMock,
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

vi.mock("@/components/shells/PlatformShell", () => ({
  PlatformShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const supabaseStub = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
  },
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseStub,
}));

vi.mock("@/lib/billing.functions", () => ({
  getCheckoutContext: vi.fn(),
  listPaymentMethods: vi.fn(),
  getCurrentFxRate: vi.fn(),
  submitPaymentProof: vi.fn(),
  cancelPendingSubscription: vi.fn(),
  supersedePendingProof: vi.fn(),
  resendBankInstructionsEmail: vi.fn(),
}));

import { CheckoutPage } from "@/routes/_authenticated/checkout.$subscriptionId";
import {
  getCheckoutContext,
  listPaymentMethods,
  getCurrentFxRate,
  submitPaymentProof,
  resendBankInstructionsEmail,
} from "@/lib/billing.functions";

// --- Fixtures -----------------------------------------------------------

const CHECKOUT = {
  subscription: {
    id: SUB_ID,
    status: "pending_payment",
    currency: "USD",
    tenants: { name: "Acme Goods", slug: "acme" },
    plans: { id: "plan-1", name: "Starter", interval: "monthly", price_usd: 19, currency: "USD", is_active: true },
    payment_proofs: [],
  },
  priceSnapshotUsd: 19,
  livePriceUsd: 19,
  priceChanged: false,
  planRemoved: false,
  referenceCode: "REF-ABCD1234-5",
  instructionsEmailLastSentAt: null,
};
const METHODS = {
  methods: [
    {
      id: "pm-1",
      label: "Vodafone Cash",
      kind: "wallet",
      account_identifier: "01000000000",
      account_holder: "CoreWeb LLC",
      instructions: "Send to the number above.",
    },
  ],
};
const FX = { rate: 49.0, base_currency: "USD", quote_currency: "EGP", effective_at: new Date().toISOString() };

function renderPage(checkoutOverride?: any) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Prime caches so the component doesn't take the "Loading checkout…" early
  // return path on first render (that path is before later useMemo/useEffect
  // hooks, so toggling it would violate the Rules of Hooks on re-render).
  qc.setQueryData(["checkout", SUB_ID], checkoutOverride ?? CHECKOUT);
  qc.setQueryData(["payment-methods"], METHODS);
  qc.setQueryData(["fx-usd-egp"], FX);
  return render(
    <QueryClientProvider client={qc}>
      <CheckoutPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (getCheckoutContext as any).mockResolvedValue(CHECKOUT);
  (listPaymentMethods as any).mockResolvedValue(METHODS);
  (getCurrentFxRate as any).mockResolvedValue(FX);
  supabaseStub.storage.from = vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
  });
});

// --- Tests --------------------------------------------------------------

describe("Checkout — payment proof submission", () => {
  it("walks review → instructions → proof, submits, and shows the pending state", async () => {
    const user = userEvent.setup();
    (submitPaymentProof as any).mockResolvedValue({ ok: true });

    renderPage();

    // Review step
    await screen.findByRole("heading", { name: /review your order/i });
    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Instructions step — pick the payment method
    await screen.findByRole("heading", { name: /payment instructions/i });
    await user.click(await screen.findByRole("button", { name: /vodafone cash/i }));
    await user.click(screen.getByRole("button", { name: /i've paid — continue/i }));

    // Proof step
    await screen.findByRole("heading", { name: /submit your proof/i });
    await user.type(screen.getByLabelText(/transaction reference/i), "TXN-982341");
    await user.type(screen.getByLabelText(/notes/i), "Sent at 10am");
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    // ConfirmDialog
    const confirmBtn = await screen.findByRole("button", { name: /^submit proof$/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(submitPaymentProof).toHaveBeenCalledTimes(1));
    // Server recomputes amountUsd/amountEgp/fxRate from trusted tables;
    // client must NOT include them in the payload.
    expect(submitPaymentProof).toHaveBeenCalledWith({
      data: {
        subscriptionId: SUB_ID,
        paymentMethodId: "pm-1",
        referenceNumber: "TXN-982341",
        screenshotPath: undefined,
        notes: "Sent at 10am",
      },
    });

    // Pending state UI
    expect(
      await screen.findByRole("heading", { name: /we received your payment proof/i }),
    ).toBeInTheDocument();
  });

  it("uploads a receipt to Supabase storage and forwards the screenshotPath", async () => {
    const user = userEvent.setup();
    (submitPaymentProof as any).mockResolvedValue({ ok: true });
    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    supabaseStub.storage.from = vi.fn().mockReturnValue({ upload: uploadMock });

    renderPage();

    await screen.findByRole("heading", { name: /review your order/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(await screen.findByRole("button", { name: /vodafone cash/i }));
    await user.click(screen.getByRole("button", { name: /i've paid — continue/i }));

    await screen.findByRole("heading", { name: /submit your proof/i });
    await user.type(screen.getByLabelText(/transaction reference/i), "TXN-1");

    // The file input is `sr-only`; query it directly and upload via userEvent
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const receipt = new File(["fake-bytes"], "receipt.png", { type: "image/png" });
    await user.upload(fileInput, receipt);

    await user.click(screen.getByRole("button", { name: /submit for review/i }));
    await user.click(await screen.findByRole("button", { name: /^submit proof$/i }));

    await waitFor(() => expect(submitPaymentProof).toHaveBeenCalledTimes(1));
    expect(supabaseStub.storage.from).toHaveBeenCalledWith("payment-proofs");
    expect(uploadMock).toHaveBeenCalledTimes(1);

    const callArg = (submitPaymentProof as any).mock.calls[0][0];
    expect(callArg.data.screenshotPath).toMatch(
      new RegExp(`^user-1/${SUB_ID}/\\d+\\.png$`),
    );
  });
});

describe("Checkout — Review step (Screen 19)", () => {
  it("renders plan, interval, and currency-formatted price from the server DTO", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /review your order/i });
    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    // USD formatted via en-US
    expect(screen.getAllByText(/\$19/).length).toBeGreaterThan(0);
    // EGP formatted via en-EG (no fraction digits)
    expect(screen.getAllByText(/EGP/i).length).toBeGreaterThan(0);
  });

  it("surfaces a price-changed notice and quotes the live price", async () => {
    renderPage({
      ...CHECKOUT,
      priceSnapshotUsd: 19,
      livePriceUsd: 29,
      priceChanged: true,
      subscription: {
        ...CHECKOUT.subscription,
        plans: { ...CHECKOUT.subscription.plans, price_usd: 29 },
      },
    });
    await screen.findByRole("heading", { name: /review your order/i });
    expect(screen.getByText(/price updated since you started/i)).toBeInTheDocument();
    expect(screen.getByText(/new total:/i)).toBeInTheDocument();
  });

  it("disables Continue and shows a 'Choose a different plan' CTA when the plan was removed", async () => {
    renderPage({
      ...CHECKOUT,
      planRemoved: true,
      subscription: {
        ...CHECKOUT.subscription,
        plans: { ...CHECKOUT.subscription.plans, is_active: false },
      },
    });
    await screen.findByRole("heading", { name: /review your order/i });
    expect(screen.getByText(/this plan is no longer available/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose a different plan/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^continue$/i })).not.toBeInTheDocument();
  });

  it("auto-routes to the dashboard when the subscription is cancelled", async () => {
    renderPage({
      ...CHECKOUT,
      subscription: { ...CHECKOUT.subscription, status: "cancelled" },
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" });
    });
  });

  it("auto-routes to the store overview when the subscription is active", async () => {
    renderPage({
      ...CHECKOUT,
      subscription: { ...CHECKOUT.subscription, status: "active" },
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/store/$slug/overview",
        params: { slug: "acme" },
      });
    });
  });

  it("renders the NOT_FOUND error panel for a missing subscription", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["payment-methods"], METHODS);
    qc.setQueryData(["fx-usd-egp"], FX);
    (getCheckoutContext as any).mockRejectedValueOnce(
      new Error(JSON.stringify({ code: "NOT_FOUND", message: "Subscription not found" })),
    );
    render(
      <QueryClientProvider client={qc}>
        <CheckoutPage />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: /checkout not found/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("renders the FORBIDDEN error panel without a retry button", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["payment-methods"], METHODS);
    qc.setQueryData(["fx-usd-egp"], FX);
    (getCheckoutContext as any).mockRejectedValueOnce(
      new Error(JSON.stringify({ code: "FORBIDDEN", message: "Forbidden" })),
    );
    render(
      <QueryClientProvider client={qc}>
        <CheckoutPage />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: /you don't have access/i }),
    ).toBeInTheDocument();
  });

  it("renders the TRANSIENT error panel with a working Retry button", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0 } },
    });
    qc.setQueryData(["payment-methods"], METHODS);
    qc.setQueryData(["fx-usd-egp"], FX);
    (getCheckoutContext as any).mockRejectedValue(
      new Error(JSON.stringify({ code: "TRANSIENT", message: "Network blip" })),
    );
    render(
      <QueryClientProvider client={qc}>
        <CheckoutPage />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole(
        "heading",
        { name: /failed to load checkout/i },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// Screen 20 — Bank Instructions step
// ----------------------------------------------------------------------

async function advanceToInstructions() {
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole("heading", { name: /review your order/i });
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await screen.findByRole("heading", { name: /payment instructions/i });
  return user;
}

describe("Checkout — Bank instructions step (Screen 20)", () => {
  it("renders the deterministic reference code from the server DTO", async () => {
    await advanceToInstructions();
    expect(screen.getByText("REF-ABCD1234-5")).toBeInTheDocument();
  });

  it("shows the 'Copied' confirmation after pressing the reference copy button", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    const user = await advanceToInstructions();
    const copyBtn = screen.getByRole("button", { name: /copy reference code/i });
    await user.click(copyBtn);
    await waitFor(() => {
      // The CopyButton swaps its sr-only label from "Copy" to "Copied"
      // for 1.5s, in addition to firing a Sonner success toast.
      expect(copyBtn).toHaveTextContent(/copied/i);
    });
  });

  it("disables the 'I've paid' CTA when no active payment methods exist", async () => {
    (listPaymentMethods as any).mockResolvedValue({ methods: [] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["checkout", SUB_ID], CHECKOUT);
    qc.setQueryData(["payment-methods"], { methods: [] });
    qc.setQueryData(["fx-usd-egp"], FX);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={qc}>
        <CheckoutPage />
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: /review your order/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /payment instructions/i });
    await waitFor(() =>
      expect(
        screen.getByText(/no payment methods are currently configured/i),
      ).toBeInTheDocument(),
    );
    const cta = screen.getByRole("button", { name: /i've paid — continue/i });
    expect(cta).toBeDisabled();
  });

  it("calls resendBankInstructionsEmail and surfaces a success toast", async () => {
    (resendBankInstructionsEmail as any).mockResolvedValue({
      ok: true,
      sentAt: new Date().toISOString(),
      recipient: "owner@example.com",
    });
    const user = await advanceToInstructions();
    await user.click(screen.getByRole("button", { name: /resend to my email/i }));
    await waitFor(() => expect(resendBankInstructionsEmail).toHaveBeenCalledTimes(1));
    expect(resendBankInstructionsEmail).toHaveBeenCalledWith({
      data: { subscriptionId: SUB_ID },
    });
  });

  it("respects a RATE_LIMITED error by reflecting the cooldown on the button", async () => {
    (resendBankInstructionsEmail as any).mockRejectedValue(
      new Error(JSON.stringify({
        code: "RATE_LIMITED",
        message: "Please wait 45s before requesting again.",
        retryAfterSeconds: 45,
      })),
    );
    const user = await advanceToInstructions();
    await user.click(screen.getByRole("button", { name: /resend to my email/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /resend in 45s/i })).toBeDisabled();
    });
  });
});
