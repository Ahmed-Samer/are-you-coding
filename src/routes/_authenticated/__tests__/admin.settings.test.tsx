import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config,
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
  listFxRates: vi.fn(),
  insertFxRate: vi.fn(),
  listFeatureFlags: vi.fn(),
  toggleFeatureFlag: vi.fn(),
}));

import { FxRatesPage } from "@/routes/_authenticated/admin.fx-rates";
import { FlagsPage } from "@/routes/_authenticated/admin.flags";
import {
  insertFxRate,
  toggleFeatureFlag,
  listFxRates,
  listFeatureFlags,
} from "@/lib/admin.functions";
import { toast } from "sonner";

const FX_ROW = {
  id: "fx-1",
  base_currency: "USD",
  quote_currency: "EGP",
  rate: 49.0,
  source: "manual",
  effective_at: new Date().toISOString(),
};

const FLAG_ROW = {
  key: "new_signups",
  description: "Allow new tenant signups",
  enabled: true,
  rollout_percent: 100,
};

function renderFx() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin", "fx-rates"], { rates: [FX_ROW] });
  return render(
    <QueryClientProvider client={qc}>
      <FxRatesPage />
    </QueryClientProvider>,
  );
}

function renderFlags() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin", "flags"], { flags: [FLAG_ROW] });
  return render(
    <QueryClientProvider client={qc}>
      <FlagsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (listFxRates as any).mockResolvedValue({ rates: [FX_ROW] });
  (listFeatureFlags as any).mockResolvedValue({ flags: [FLAG_ROW] });
});

describe("Admin settings — FX rate update", () => {
  it("renders current FX rate from the cache", async () => {
    renderFx();
    await waitFor(() =>
      expect(screen.getAllByText("49.00").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText(/USD\/EGP/).length).toBeGreaterThan(0);
  });

  it("submits a new rate via insertFxRate", async () => {
    const user = userEvent.setup();
    (insertFxRate as any).mockResolvedValue({ ok: true });

    renderFx();

    await user.click(await screen.findByRole("button", { name: /override rate/i }));

    const rateInput = await screen.findByLabelText(/^rate$/i);
    await user.clear(rateInput);
    await user.type(rateInput, "49.25");

    await user.click(screen.getByRole("button", { name: /apply rate/i }));

    await waitFor(() => expect(insertFxRate).toHaveBeenCalledTimes(1));
    expect(insertFxRate).toHaveBeenCalledWith({
      data: { baseCurrency: "USD", quoteCurrency: "EGP", rate: 49.25 },
    });
    await waitFor(() =>
      expect((toast as any).success).toHaveBeenCalledWith("Rate updated"),
    );
  });
});

describe("Admin settings — feature flag toggle", () => {
  it("renders the feature flag row", async () => {
    renderFlags();
    expect(await screen.findByText("new_signups")).toBeInTheDocument();
    expect(screen.getByText(/allow new tenant signups/i)).toBeInTheDocument();
  });

  it("calls toggleFeatureFlag when the switch is clicked", async () => {
    const user = userEvent.setup();
    (toggleFeatureFlag as any).mockResolvedValue({ ok: true });

    renderFlags();

    const sw = await screen.findByRole("switch");
    await user.click(sw);

    await waitFor(() => expect(toggleFeatureFlag).toHaveBeenCalledTimes(1));
    expect(toggleFeatureFlag).toHaveBeenCalledWith({
      data: { key: "new_signups", enabled: false, rolloutPercent: 100 },
    });
    expect((toast as any).success).toHaveBeenCalledWith("new_signups disabled");
  });
});
