import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    createFileRoute: () => (config: unknown) => config,
    Link: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children: React.ReactNode;
    } & Record<string, unknown>) =>
      React.createElement("a", { href: to, ...rest }, children),
    useRouter: () => ({ preloadRoute: vi.fn() }),
  };
});

vi.mock("@/components/shells/PlatformShell", () => ({
  PlatformShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

vi.mock("@/lib/use-intent-trigger", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/lib/auth-context", () => ({
  useSession: () => ({ signOut: vi.fn() }),
  useUser: () => null,
}));

import { Route } from "../about";

const AboutPage = (Route as unknown as { component: () => React.ReactElement })
  .component;

describe("AboutPage", () => {
  it("renders the hero H1, four values, four metrics, and closing CTAs", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /premium storefront/i }),
    ).toBeInTheDocument();

    // 4 values
    expect(screen.getByText(/Operator-first/i)).toBeInTheDocument();
    expect(screen.getByText(/Premium by default/i)).toBeInTheDocument();
    expect(screen.getByText(/Fast, always/i)).toBeInTheDocument();
    expect(screen.getByText(/Local-friendly/i)).toBeInTheDocument();

    // Trust metrics
    expect(screen.getByText(/Stores launched/i)).toBeInTheDocument();
    expect(screen.getByText(/Regions served/i)).toBeInTheDocument();
    expect(screen.getByText(/Platform uptime/i)).toBeInTheDocument();
    expect(screen.getByText(/Lighthouse score/i)).toBeInTheDocument();

    // Customer quote
    expect(screen.getByText(/Amelia Okafor/)).toBeInTheDocument();

    // CTAs
    const getStarted = screen.getByRole("link", { name: /get started/i });
    expect(getStarted).toHaveAttribute("href", "/signup");
    const templates = screen.getByRole("link", { name: /browse templates/i });
    expect(templates).toHaveAttribute("href", "/templates");
  });

  it("declares Organization JSON-LD in route head scripts", () => {
    const head = (
      Route as unknown as {
        head: () => { scripts: Array<{ type: string; children: string }> };
      }
    ).head();
    const ld = head.scripts.find(
      (s) => s.type === "application/ld+json",
    );
    expect(ld).toBeTruthy();
    const parsed = JSON.parse(ld!.children);
    expect(parsed["@type"]).toBe("Organization");
    expect(parsed.name).toBe("CoreWeb");
  });
});