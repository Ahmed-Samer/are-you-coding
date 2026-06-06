import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { captureLead, type CaptureLeadInputType } from "@/lib/leads.functions";

export type LeadStatus = "idle" | "validating" | "pending" | "success" | "error";

const EmailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Please enter a valid email address.")
  .max(254, "Email is too long.");

function readAttribution(): Pick<
  CaptureLeadInputType,
  "referrer" | "utm_source" | "utm_medium" | "utm_campaign"
> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    referrer: document.referrer || null,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
  };
}

export function useLeadCapture() {
  const submit = useServerFn(captureLead);
  const [status, setStatus] = useState<LeadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  const capture = useCallback(
    async (email: string, source: CaptureLeadInputType["source"]) => {
      setStatus("validating");
      const parsed = EmailSchema.safeParse(email);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message ?? "Invalid email.";
        setError(errorMsg);
        setStatus("error");
        toast.error(errorMsg);
        return false;
      }
      setError(null);
      setStatus("pending");
      try {
        await submit({
          data: {
            email: parsed.data,
            source,
            ...readAttribution(),
          },
        });
        setStatus("success");
        toast.success("Welcome to RentWebify! Check your inbox.");
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
        setError(message);
        setStatus("error");
        toast.error(message);
        return false;
      }
    },
    [submit],
  );

  return { status, error, capture, reset };
}