import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Mocks --------------------------------------------------------------

const TENANT = { id: "11111111-1111-1111-1111-111111111111", slug: "acme", name: "Acme", currency: "EGP" };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => ({ ...config }),
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
  useParams: () => ({ slug: "acme" }),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: any) => fn }));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/routes/_authenticated/store.$slug", () => ({
  useStore: () => ({ tenant: TENANT }),
}));

const domainFnsMock = vi.hoisted(() => ({
  listMyDomains: vi.fn(),
  addDomain: vi.fn(),
  removeDomain: vi.fn(),
  triggerDomainVerification: vi.fn(),
  setPrimaryDomain: vi.fn(),
}));
vi.mock("@/lib/domains.functions", () => domainFnsMock);

import { DomainsTab } from "@/routes/_authenticated/store.$slug.domains";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DomainsTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (domainFnsMock.listMyDomains as any).mockResolvedValue({ domains: [] });
  (domainFnsMock.addDomain as any).mockResolvedValue({
    domain: { id: "dom-new", host: "store.acme.com", verification_token: "rwv-test-token" },
  });
  (domainFnsMock.removeDomain as any).mockResolvedValue({ ok: true });
  (domainFnsMock.triggerDomainVerification as any).mockResolvedValue({
    success: true, status: "verified", found: "rwv-test-token",
  });
  (domainFnsMock.setPrimaryDomain as any).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DomainsTab", () => {
  it("renders the empty state and the platform subdomain", async () => {
    renderPage();
    expect(screen.getByText(/acme\.rentwebify\.app/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/no custom domain yet/i)).toBeInTheDocument(),
    );
    expect(domainFnsMock.listMyDomains).toHaveBeenCalledWith({
      data: { tenantId: TENANT.id },
    });
  });

  it("calls addDomain when submitting a new domain", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/no custom domain yet/i));

    const input = screen.getByPlaceholderText(/shop\.brand\.com/i);
    await user.type(input, "store.acme.com");
    await user.click(screen.getByRole("button", { name: /add domain/i }));

    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: /add domain/i }));

    await waitFor(() =>
      expect(domainFnsMock.addDomain).toHaveBeenCalledWith({
        data: { tenantId: TENANT.id, host: "store.acme.com" },
      }),
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        expect.stringContaining("store.acme.com"),
      ),
    );
  });

  it("renders pending domain rows with DNS records and triggers server verification", async () => {
    const user = userEvent.setup();
    (domainFnsMock.listMyDomains as any).mockResolvedValue({
      domains: [{
        id: "dom-pending",
        host: "store.acme.com",
        kind: "custom",
        status: "pending",
        verification_token: "rwv-test-token",
        verified_at: null,
        created_at: new Date().toISOString(),
      }],
    });

    renderPage();

    await screen.findByText("CNAME");
    expect(screen.getByText("TXT")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /verify now/i }));

    await waitFor(() =>
      expect(domainFnsMock.triggerDomainVerification).toHaveBeenCalledWith({
        data: { tenantId: TENANT.id, id: "dom-pending" },
      }),
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Domain verified"),
    );
  });

  it("calls removeDomain after the two-step disconnect confirmation", async () => {
    const user = userEvent.setup();
    (domainFnsMock.listMyDomains as any).mockResolvedValue({
      domains: [{
        id: "dom-pending",
        host: "store.acme.com",
        kind: "custom",
        status: "pending",
        verification_token: "rwv-test-token",
        verified_at: null,
        created_at: new Date().toISOString(),
      }],
    });

    renderPage();
    await screen.findByText("CNAME");

    await user.click(screen.getByRole("button", { name: /remove store\.acme\.com/i }));
    const disconnectAlert = await screen.findByRole("alertdialog");
    await user.click(within(disconnectAlert).getByRole("button", { name: /continue/i }));

    const confirmInput = await screen.findByPlaceholderText("store.acme.com");
    const finalDialog = confirmInput.closest('[role="dialog"]') as HTMLElement;
    await user.type(confirmInput, "store.acme.com");
    await user.click(within(finalDialog).getByRole("button", { name: /disconnect domain/i }));

    await waitFor(() =>
      expect(domainFnsMock.removeDomain).toHaveBeenCalledWith({
        data: { tenantId: TENANT.id, id: "dom-pending" },
      }),
    );
  });

  it("calls setPrimaryDomain on a verified domain", async () => {
    const user = userEvent.setup();
    (domainFnsMock.listMyDomains as any).mockResolvedValue({
      domains: [
        {
          id: "dom-a",
          host: "shop.acme.com",
          kind: "custom",
          status: "verified",
          verification_token: "tok-a",
          verified_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: "dom-b",
          host: "store.acme.com",
          kind: "custom",
          status: "verified",
          verification_token: "tok-b",
          verified_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    });

    renderPage();
    // First verified domain becomes primary by default; the other gets the button.
    const makePrimary = await screen.findByRole("button", { name: /make primary/i });
    await user.click(makePrimary);

    await waitFor(() =>
      expect(domainFnsMock.setPrimaryDomain).toHaveBeenCalledTimes(1),
    );
    expect(domainFnsMock.setPrimaryDomain).toHaveBeenCalledWith({
      data: { tenantId: TENANT.id, id: expect.any(String) },
    });
  });
});
