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
  createTenantAndSubscription: vi.fn(),
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
import { listPlans, createTenantAndSubscription } from "@/lib/billing.functions";
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
      features: ["100 products", "WhatsApp checkout"],
    },
    {
      slug: "growth-monthly",
      name: "Growth",
      price_usd: 49,
      interval: "monthly",
      description: "For scaling stores",
      features: ["Unlimited products"],
    },
  ],
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
});

// --- Tests --------------------------------------------------------------

describe("Onboarding wizard (signup → onboarding → first store created)", () => {
  it("renders the basics step with name + slug fields", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /store basics/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/store name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/store address/i)).toBeInTheDocument();
    // Continue is disabled until valid name + slug
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("auto-slugifies the name and rejects an invalid slug", async () => {
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByLabelText(/store name/i);
    await user.type(name, "Acme Goods!");

    const slug = screen.getByLabelText(/store address/i) as HTMLInputElement;
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

  it("completes all steps, creates the store, and navigates to checkout", async () => {
    const user = userEvent.setup();
    (createTenantAndSubscription as any).mockResolvedValue({
      tenantId: "tenant-123",
      subscriptionId: "sub-abc",
    });

    renderPage();

    // Step 1: basics
    await user.type(await screen.findByLabelText(/store name/i), "Acme Goods");
    const cont1 = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont1).toBeEnabled(), { timeout: 2000 });
    await user.click(cont1);

    // Step 2: template — default "atelier" is available; just continue
    await screen.findByRole("heading", { name: /choose a template/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Step 3: plan — wait for plans to load, then pick Starter
    await screen.findByRole("heading", { name: /pick your plan/i });
    const starter = await screen.findByRole("radio", { name: /starter/i });
    await user.click(starter);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Step 4: confirm + create
    await screen.findByRole("heading", { name: /confirm and continue/i });
    const create = screen.getByRole("button", { name: /create store/i });
    await user.click(create);

    await waitFor(() => expect(createTenantAndSubscription).toHaveBeenCalledTimes(1));
    const callArg = (createTenantAndSubscription as any).mock.calls[0][0];
    expect(callArg.data).toMatchObject({
      name: "Acme Goods",
      slug: "acme-goods",
      planSlug: "starter-monthly",
      interval: "monthly",
      niche: "retail",
      template: "atelier",
    });
    // Idempotency key is generated client-side and passed to the server.
    expect(typeof callArg.data.idempotencyKey).toBe("string");
    expect(callArg.data.idempotencyKey.length).toBeGreaterThan(8);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/checkout/$subscriptionId",
          params: { subscriptionId: "sub-abc" },
        }),
      ),
    );

    // Draft now persists until the checkout route mounts and clears it.
    // The submitted subscriptionId is recorded so a retry returns to the
    // same checkout if the user reloads before checkout mount fires.
    const persisted = JSON.parse(
      localStorage.getItem("coreweb:onboarding:draft:v4") ?? "{}",
    );
    expect(persisted.submittedSubscriptionId).toBe("sub-abc");
    expect((toast as any).success).toHaveBeenCalled();
  });

  it("routes a SLUG_TAKEN structured error back to the basics step", async () => {
    const user = userEvent.setup();
    (createTenantAndSubscription as any).mockRejectedValue(
      new Error(
        JSON.stringify({
          code: "SLUG_TAKEN",
          message: "That store address is already taken.",
          step: "basics",
          field: "slug",
        }),
      ),
    );

    renderPage();
    await user.type(await screen.findByLabelText(/store name/i), "Acme Goods");
    const cont = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont).toBeEnabled(), { timeout: 2000 });
    await user.click(cont);
    await user.click(await screen.findByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your plan/i });
    await user.click(await screen.findByRole("radio", { name: /starter/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(await screen.findByRole("button", { name: /create store/i }));

    await waitFor(() =>
      expect((toast as any).error).toHaveBeenCalledWith(
        "That store address is already taken.",
      ),
    );
    // Bounced back to basics.
    await screen.findByRole("heading", { name: /store basics/i });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("retains backwards compatibility with legacy free-text errors", async () => {
    const user = userEvent.setup();
    (createTenantAndSubscription as any).mockRejectedValue(
      new Error("Slug already taken"),
    );

    renderPage();
    await user.type(await screen.findByLabelText(/store name/i), "Acme Goods");
    const cont = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(cont).toBeEnabled(), { timeout: 2000 });
    await user.click(cont);
    await user.click(await screen.findByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your plan/i });
    await user.click(await screen.findByRole("radio", { name: /starter/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(await screen.findByRole("button", { name: /create store/i }));

    await waitFor(() =>
      expect((toast as any).error).toHaveBeenCalledWith("Slug already taken"),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
