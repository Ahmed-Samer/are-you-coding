import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const submitMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    createFileRoute: () => (config: unknown) => config,
    Link: ({
      to,
      children,
      ...rest
    }: { to: string; children: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("a", { href: to, ...rest }, children),
    useRouter: () => ({ preloadRoute: vi.fn(), navigate: vi.fn() }),
  };
});

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => submitMock,
}));

vi.mock("@/lib/contact.functions", () => ({
  submitContactMessage: vi.fn(),
}));

vi.mock("@/components/shells/PlatformShell", () => ({
  PlatformShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

vi.mock("@/lib/auth-context", () => ({
  useSession: () => ({ signOut: vi.fn() }),
  useUser: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { Route } from "../contact";
import { CONTACT_INFO } from "@/lib/contact-info";

const ContactPage = (Route as unknown as { component: () => React.ReactElement })
  .component;

function fillValid() {
  fireEvent.change(screen.getByLabelText(/^name$/i), {
    target: { value: "Jane Operator" },
  });
  fireEvent.change(screen.getByLabelText(/^email$/i), {
    target: { value: "jane@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^message$/i), {
    target: { value: "Hello team, we're evaluating CoreWeb for our store." },
  });
}

describe("ContactPage", () => {
  beforeEach(() => {
    submitMock.mockReset();
  });

  it("renders heading, fields, sidebar from CONTACT_INFO, and a honeypot", () => {
    render(<ContactPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /talk to us/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument();

    // Sidebar driven by CONTACT_INFO
    expect(screen.getByText(CONTACT_INFO.email)).toBeInTheDocument();
    const waLink = screen.getByRole("link", { name: /open whatsapp/i });
    expect(waLink).toHaveAttribute("href", CONTACT_INFO.whatsappUrl);

    // Honeypot present and visually hidden
    const honeypot = document.querySelector(
      'input[name="website"]',
    ) as HTMLInputElement | null;
    expect(honeypot).toBeTruthy();
    expect(honeypot!.tabIndex).toBe(-1);
    expect(honeypot!.closest(".sr-only")).not.toBeNull();
  });

  it("blocks submit when message is too short and does not call the server", async () => {
    render(<ContactPage />);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: "too short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() =>
      expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument(),
    );
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("shows a persistent success card after a successful submit", async () => {
    submitMock.mockResolvedValueOnce({ ok: true });
    render(<ContactPage />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /message received/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /send another message/i }),
    ).toBeInTheDocument();
  });

  it("shows an error alert with a retry button on failure", async () => {
    submitMock.mockRejectedValueOnce(new Error("Network down"));
    render(<ContactPage />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't send your message/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();

    // Retry succeeds → success card
    submitMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /message received/i }),
      ).toBeInTheDocument(),
    );
  });

  it("declares ContactPage JSON-LD in route head scripts", () => {
    const head = (
      Route as unknown as {
        head: () => { scripts: Array<{ type: string; children: string }> };
      }
    ).head();
    const ld = head.scripts.find((s) => s.type === "application/ld+json");
    expect(ld).toBeTruthy();
    const parsed = JSON.parse(ld!.children);
    expect(parsed["@type"]).toBe("ContactPage");
  });
});