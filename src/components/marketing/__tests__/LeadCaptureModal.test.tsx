import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LeadCaptureModal } from "../LeadCaptureModal";

// Mock the server-fn hook so the modal doesn't hit the network.
vi.mock("@/lib/use-lead-capture", () => {
  return {
    useLeadCapture: () => ({
      status: "idle" as const,
      error: null,
      capture: vi.fn().mockResolvedValue(true),
      reset: vi.fn(),
    }),
  };
});

describe("LeadCaptureModal", () => {
  it("renders title and email input when open", () => {
    render(
      <LeadCaptureModal
        open
        onOpenChange={() => undefined}
        source="exit_intent"
      />,
    );
    expect(
      screen.getByText(/retail launch playbook/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it("invokes onOpenChange(false) when Escape is pressed", async () => {
    const onOpenChange = vi.fn();
    render(
      <LeadCaptureModal
        open
        onOpenChange={onOpenChange}
        source="exit_intent"
      />,
    );
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});