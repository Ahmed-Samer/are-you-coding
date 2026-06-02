import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mocks --------------------------------------------------------------

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => ({ ...config }),
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  redirect: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/components/shells/PlatformShell", () => ({
  PlatformShell: ({ children }: any) => <div>{children}</div>,
}));

const mfaMock = vi.hoisted(() => ({
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  unenroll: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}));
const authMock = vi.hoisted(() => ({
  mfa: mfaMock,
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resend: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: authMock },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn() } },
}));

import { SecurityPage } from "@/routes/_authenticated/account.security";
import { LoginPage } from "@/routes/login";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no factors
  mfaMock.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
});

// Expose the page components for testing (route exports default to component option)
// The route files don't export the components, so re-export via a helper.

// --- SecurityPage tests -------------------------------------------------

describe("SecurityPage — MFA enroll/unenroll", () => {
  it("enrolls a TOTP factor: QR code → 6-digit code → success", async () => {
    const user = userEvent.setup();
    mfaMock.enroll.mockResolvedValue({
      data: {
        id: "factor-1",
        totp: {
          qr_code: "data:image/svg+xml;base64,FAKEQR",
          secret: "JBSWY3DPEHPK3PXP",
          uri: "otpauth://totp/Test",
        },
      },
      error: null,
    });
    mfaMock.challenge.mockResolvedValue({ data: { id: "ch-1" }, error: null });
    mfaMock.verify.mockResolvedValue({ data: {}, error: null });

    render(<SecurityPage />);

    await user.click(await screen.findByRole("button", { name: /add authenticator/i }));

    // QR + secret rendered
    const qr = await screen.findByAltText(/totp qr code/i);
    expect(qr).toHaveAttribute("src", expect.stringContaining("FAKEQR"));
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/enter the 6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify & enable/i }));

    await waitFor(() => {
      expect(mfaMock.challenge).toHaveBeenCalledWith({ factorId: "factor-1" });
      expect(mfaMock.verify).toHaveBeenCalledWith({
        factorId: "factor-1",
        challengeId: "ch-1",
        code: "123456",
      });
    });
    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringContaining("Two-factor"),
    );
  });

  it("unenrolls an existing factor after confirmation", async () => {
    const user = userEvent.setup();
    mfaMock.listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: "factor-existing", friendly_name: "My Phone", factor_type: "totp", status: "verified" },
        ],
      },
      error: null,
    });
    mfaMock.unenroll.mockResolvedValue({ data: {}, error: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SecurityPage />);

    expect(await screen.findByText("My Phone")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    await waitFor(() => {
      expect(mfaMock.unenroll).toHaveBeenCalledWith({ factorId: "factor-existing" });
    });
    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringContaining("removed"),
    );
  });
});

// --- Login step-up tests -------------------------------------------------

describe("LoginPage — MFA step-up challenge", () => {
  it("prompts for MFA code after password login when nextLevel is aal2", async () => {
    const user = userEvent.setup();
    authMock.signInWithPassword.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    mfaMock.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    mfaMock.listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-stepup", status: "verified" }] },
      error: null,
    });
    mfaMock.challenge.mockResolvedValue({ data: { id: "ch-stepup" }, error: null });
    mfaMock.verify.mockResolvedValue({ data: {}, error: null });

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/^email$/i), "user@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    // Step-up screen appears
    expect(await screen.findByRole("heading", { name: /two-factor verification/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(mfaMock.challenge).toHaveBeenCalledWith({ factorId: "factor-stepup" });
    });

    const codeInput = screen.getByLabelText(/authentication code/i);
    await user.type(codeInput, "654321");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(mfaMock.verify).toHaveBeenCalledWith({
        factorId: "factor-stepup",
        challengeId: "ch-stepup",
        code: "654321",
      });
    });
    expect(toastMock.success).toHaveBeenCalledWith("Welcome back");
  });
});
