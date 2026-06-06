import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks --------------------------------------------------------------

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config,
  useNavigate: () => navigateMock,
  useSearch: () => ({ plan: undefined, template: undefined }),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("@tanstack/react-start", () => {
  const chain: any = {
    inputValidator: () => chain,
    middleware: () => chain,
    handler: () => () => Promise.resolve(undefined),
  };
  return {
    useServerFn: (fn: any) => fn,
    createServerFn: () => chain,
  };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));

vi.mock("@/lib/rate-limit.server", () => ({
  getClientIp: () => "test",
  assertSameOrigin: () => {},
  enforceRateLimit: async () => {},
}));

vi.mock("@/lib/billing.functions", () => ({
  listPlans: vi.fn(),
  createTenant: vi.fn(),
  createAccountSubscription: vi.fn(),
  getMyAccountSubscription: vi.fn(),
}));

vi.mock("@/lib/billing-admin.functions", () => ({
  upgradeAccountPlan: vi.fn(),
}));

vi.mock("@/lib/onboarding.functions", () => ({
  checkSlugAvailability: vi.fn(async ({ data }: any) => ({
    slug: data?.slug ?? "",
    available: true,
    reason: "available",
  })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// PlatformShell pulls in auth context; stub it to a passthrough so the test
// stays focused on the wizard itself.
vi.mock("@/components/shells/PlatformShell", () => ({
  PlatformShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { OnboardingPage } from "@/routes/_authenticated/onboarding";
import { listPlans, createTenant, createAccountSubscription, getMyAccountSubscription } from "@/lib/billing.functions";
import { toast } from "sonner";

// --- Helpers ------------------------------------------------------------

const PLANS = {
  plans: [
    {
      slug: "starter-monthly",
      name: "Starter",
      price_usd: 19,
      interval: "monthly",
      description: "For new merchants",
      features: ["1 Storefront included", "100 products", "WhatsApp checkout"],
    },
    {
      slug: "growth-monthly",
      name: "Growth",
      price_usd: 49,
      interval: "monthly",
      description: "For scaling stores",
      features: ["Up to 3 Storefronts", "Unlimited products"],
    },
  ],
};

// Mock response for getMyAccountSubscription when user has NO active subscription
const NO_SUB_RESPONSE = {
  subscription: null,
  currentStoreCount: 0,
  quota: { maxStores: 0, hasCustomDomain: false, canCreateMore: false },
};

// Mock response for getMyAccountSubscription when user HAS an active subscription
const ACTIVE_SUB_RESPONSE = {
  subscription: {
    id: "sub-123",
    status: "active",
    plans: { name: "Starter", slug: "starter-monthly", max_stores: 1, has_custom_domain: false },
  },
  currentStoreCount: 0,
  quota: { maxStores: 1, hasCustomDomain: false, canCreateMore: true },
};

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <OnboardingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  (listPlans as any).mockResolvedValue(PLANS);
  // Default: no active subscription (full flow)
  (getMyAccountSubscription as any).mockResolvedValue(NO_SUB_RESPONSE);
});

// --- Tests --------------------------------------------------------------

describe("Onboarding wizard — FULL FLOW (no active subscription)", () => {
  it("renders the basics step with name + slug fields", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /platform specifics/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/platform name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/platform address/i)).toBeInTheDocument();
    // Continue is disabled until valid name + slug
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("auto-slugifies the name and rejects an invalid slug", async () => {
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByLabelText(/platform name/i);
    await user.type(name, "Acme Goods!");

    const slug = screen.getByLabelText(/platform address/i) as HTMLInputElement;
    // slugify strips "!", lowercases, joins with "-"
    await waitFor(() => expect(slug.value).toBe("acme-goods"));

    const continueBtn = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(continueBtn).toBeEnabled(), { timeout: 2000 });

    // Type an invalid slug (too short) → Continue must disable, helper text shown
    await user.clear(slug);
    await user.type(slug, "ab");
    await waitFor(() => expect(continueBtn).toBeDisabled());
    await waitFor(() =>
      expect(
        screen.getByText(/Lowercase letters, numbers, and hyphens/i),
      ).toBeInTheDocument(),
    );

    // Fix it
    await user.clear(slug);
    await user.type(slug, "acme");
    await waitFor(() => expect(continueBtn).toBeEnabled(), { timeout: 2000 });
  });

  it("completes full flow: creates subscription, navigates to checkout", async () => {
    const user = userEvent.setup();
    (createAccountSubscription as any).mockResolvedValue({
      subscriptionId: "acct-sub-456",
      planSlug: "starter-monthly",
    });

    renderPage();

    // Step 1: basics
    await user.type(await screen.findByLabelText(/platform name/i), "Acme Goods");
    const cont1 = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont1).toBeEnabled(), { timeout: 2000 });
    await user.click(cont1);

    // Step 2: template — default "classic" is available; just continue
    await screen.findByRole("heading", { name: /choose an architecture/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Step 3: plan — wait for plans to load, then pick Starter
    await screen.findByRole("heading", { name: /pick your plan/i });
    const starter = await screen.findByRole("radio", { name: /starter/i });
    await user.click(starter);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Step 4: confirm + create
    await screen.findByRole("heading", { name: /confirm and deploy/i });
    const create = screen.getByRole("button", { name: /deploy/i });
    await user.click(create);

    await waitFor(() => expect(createAccountSubscription).toHaveBeenCalledTimes(1));
    const callArg = (createAccountSubscription as any).mock.calls[0][0];
    expect(callArg.data).toMatchObject({
      planSlug: "starter-monthly",
      interval: "monthly",
    });

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/checkout/$subscriptionId",
          params: { subscriptionId: "acct-sub-456" },
        }),
      ),
    );

    expect((toast as any).success).toHaveBeenCalled();
  });
});

describe("Onboarding wizard — SHORT FLOW (active subscription)", () => {
  beforeEach(() => {
    (getMyAccountSubscription as any).mockResolvedValue(ACTIVE_SUB_RESPONSE);
  });

  it("shows short flow with 3 steps and no plan step", async () => {
    renderPage();
    // Should show "Create a new store" heading
    expect(await screen.findByRole("heading", { name: /platform specifics/i })).toBeInTheDocument();
    // Should show the active subscription banner
    expect(await screen.findByText(/active subscription/i)).toBeInTheDocument();
  });

  it("creates a store directly without payment in short flow", async () => {
    const user = userEvent.setup();
    (createTenant as any).mockResolvedValue({
      tenantId: "tenant-789",
      slug: "quick-store",
    });

    renderPage();

    // Step 1: basics
    await user.type(await screen.findByLabelText(/platform name/i), "Quick Store");
    const cont1 = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont1).toBeEnabled(), { timeout: 2000 });
    await user.click(cont1);

    // Step 2: template — continue
    await screen.findByRole("heading", { name: /choose an architecture/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Step 3: confirm + create (no plan step!)
    await screen.findByRole("heading", { name: /confirm and deploy/i });
    const create = screen.getByRole("button", { name: /create store/i });
    await user.click(create);

    await waitFor(() => expect(createTenant).toHaveBeenCalledTimes(1));
    const callArg = (createTenant as any).mock.calls[0][0];
    expect(callArg.data).toMatchObject({
      name: "Quick Store",
      slug: "quick-store",
      niche: "retail",
      template: "classic",
    });

    // Should navigate to dashboard (not checkout)
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/dashboard",
        }),
      ),
    );

    expect((toast as any).success).toHaveBeenCalled();
    // createAccountSubscription should NOT be called in short flow
    expect(createAccountSubscription).not.toHaveBeenCalled();
  });
});
