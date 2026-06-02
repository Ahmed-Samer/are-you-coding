import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Check, Copy, Clock, Upload, X, AlertTriangle, ArrowLeft, Mail } from "lucide-react";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getCheckoutContext,
  listPaymentMethods,
  getCurrentFxRate,
  submitPaymentProof,
  cancelPendingSubscription,
  supersedePendingProof,
  resendBankInstructionsEmail,
} from "@/lib/billing.functions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { formatMoney } from "@/lib/format-price";

const ONBOARDING_DRAFT_KEY = "coreweb:onboarding:draft:v4";

export const Route = createFileRoute("/_authenticated/checkout/$subscriptionId")({
  head: () => ({ meta: [{ title: "Checkout — CoreWeb" }] }),
  validateSearch: z.object({ from: z.string().max(32).optional() }),
  component: CheckoutPage,
});

type StepId = "review" | "instructions" | "proof" | "pending";

const STEPS: { id: StepId; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "instructions", label: "Payment instructions" },
  { id: "proof", label: "Submit proof" },
  { id: "pending", label: "Pending review" },
];

function Stepper({ current }: { current: StepId }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={
                "inline-flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold " +
                (done
                  ? "bg-primary text-primary-foreground border-primary"
                  : active
                  ? "border-foreground text-foreground"
                  : "border-border text-muted-foreground")
              }
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={active || done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function fmtUsd(n: number) {
  return formatMoney(n, "USD", "en-US");
}
function fmtEgp(n: number) {
  return formatMoney(n, "EGP", "en-EG");
}

/**
 * Inline copy button with self-contained "Copied" feedback. The icon
 * swaps to a check for 1.5s after a successful copy, and the surrounding
 * caller still owns the actual write-to-clipboard logic so it can fall
 * back to the legacy textarea path in insecure contexts.
 */
function CopyButton({
  value,
  onCopy,
  ariaLabel,
  size = "sm",
}: {
  value: string;
  onCopy: (text: string) => Promise<boolean>;
  ariaLabel: string;
  size?: "sm" | "icon";
}) {
  const [done, setDone] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  return (
    <Button
      type="button"
      size={size}
      variant="ghost"
      aria-label={ariaLabel}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await onCopy(value);
        if (!ok) return;
        setDone(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span className="sr-only" aria-live="polite">
        {done ? "Copied" : "Copy"}
      </span>
    </Button>
  );
}

/**
 * Insecure-context fallback: a selectable, readonly text field with a
 * "press to copy" hint. Used in places where `navigator.clipboard` is
 * unavailable (HTTP, in-app webviews, ancient browsers). Selecting the
 * field works in every environment we care about.
 */
function ManualCopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
      <div className="text-amber-700 dark:text-amber-400 font-medium">{label}</div>
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 w-full bg-transparent font-mono text-foreground outline-none"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Tap or click to select, then press {navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}-C to copy.
      </p>
    </div>
  );
}

/**
 * Structured Checkout-context error parser. The server encodes
 * `{ code, message }` as JSON in `Error.message` so the UI can branch
 * cleanly between 404 / 403 / transient panels.
 */
type CheckoutErrorCode = "NOT_FOUND" | "FORBIDDEN" | "TRANSIENT";
type ParsedCheckoutError = { code: CheckoutErrorCode; message: string };

function parseCheckoutError(err: unknown): ParsedCheckoutError {
  if (!(err instanceof Error)) {
    return { code: "TRANSIENT", message: "Something went wrong." };
  }
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
      return {
        code: (parsed.code as CheckoutErrorCode) ?? "TRANSIENT",
        message: typeof parsed.message === "string" ? parsed.message : err.message,
      };
    }
  } catch {
    // fall through
  }
  return { code: "TRANSIENT", message: err.message };
}

export function CheckoutPage() {
  const { subscriptionId } = Route.useParams();
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // After a successful onboarding handoff, clear the persisted draft. This
  // is deferred from the onboarding wizard so the draft survives any
  // navigation hiccup between create-success and checkout-mount.
  useEffect(() => {
    if (from === "onboarding") {
      try { window.localStorage.removeItem(ONBOARDING_DRAFT_KEY); } catch {}
    }
  }, [from]);

  const fetchCheckout = useServerFn(getCheckoutContext);
  const fetchMethods = useServerFn(listPaymentMethods);
  const fetchFx = useServerFn(getCurrentFxRate);
  const submit = useServerFn(submitPaymentProof);
  const cancelSub = useServerFn(cancelPendingSubscription);
  const supersede = useServerFn(supersedePendingProof);
  const resendEmail = useServerFn(resendBankInstructionsEmail);

  const { data: checkout, isLoading, error: checkoutError, refetch: refetchCheckout } = useQuery({
    queryKey: ["checkout", subscriptionId],
    queryFn: () => fetchCheckout({ data: { subscriptionId } }),
    // Short-circuit retries for structured 404/403 — those won't resolve on
    // a retry and only delay the error UI.
    retry: (count, err) => {
      const parsed = parseCheckoutError(err);
      if (parsed.code === "NOT_FOUND" || parsed.code === "FORBIDDEN") return false;
      return count < 1;
    },
    refetchInterval: (q) => {
      const data: any = q.state.data;
      const status = data?.subscription?.status;
      const hasPending = (data?.subscription?.payment_proofs ?? []).some((p: any) => p.status === "pending");
      // Poll while we're waiting on review or activation
      return status === "active" ? false : hasPending ? 15_000 : false;
    },
  });
  const { data: methodsData } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => fetchMethods(),
  });
  const { data: fxData, error: fxError, isLoading: fxLoadingQuery } = useQuery({
    queryKey: ["fx-usd-egp"],
    queryFn: () => fetchFx(),
    retry: 1,
  });

  const sub: any = checkout?.subscription;
  const proofs: any[] = sub?.payment_proofs ?? [];
  const hasPendingProof = useMemo(
    () => proofs.some((p: any) => p.status === "pending"),
    [proofs],
  );
  const pendingProof = useMemo(
    () => (sub?.payment_proofs ?? []).find((p: any) => p.status === "pending"),
    [sub],
  );
  const latestProof = proofs[0];
  const latestProofStatus: string | null = latestProof?.status ?? null;
  const isActive = sub?.status === "active";

  // Land the user on the right step:
  //   active            → pending (success screen)
  //   pending proof     → pending (waiting review)
  //   latest rejected   → proof   (let them resubmit, with an inline alert)
  //   otherwise         → review
  const initialStep: StepId = isActive
    ? "pending"
    : hasPendingProof
    ? "pending"
    : latestProofStatus === "rejected"
    ? "proof"
    : "review";

  const [step, setStep] = useState<StepId>(initialStep);
  const [methodId, setMethodId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastStatusRef = useRef<string | null>(null);
  const lastProofStatusRef = useRef<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const autoRoutedRef = useRef(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  // Detect clipboard availability once; the legacy textarea fallback always
  // works but we want to surface the "press to copy" hint up-front when the
  // browser can't grant async clipboard access (insecure context, in-app
  // webview, older Safari, etc.).
  const clipboardSupported = useMemo(() => {
    if (typeof navigator === "undefined") return true;
    return !!(navigator.clipboard && typeof window !== "undefined" && window.isSecureContext);
  }, []);

  // In-app notification: detect when sub becomes active or proof gets rejected.
  useEffect(() => {
    if (!sub) return;
    const proofs = sub.payment_proofs ?? [];
    const latestProof = proofs[0];
    if (lastStatusRef.current && lastStatusRef.current !== sub.status && sub.status === "active") {
      toast.success("Your subscription is now active!", { description: "Your store is live." });
    }
    if (
      lastProofStatusRef.current === "pending" &&
      latestProof?.status === "rejected"
    ) {
      toast.error("Your payment proof was rejected", { description: "Please review your details and resubmit." });
      // Auto-advance the stepper back to the proof step so the user is not
      // stranded on the pending screen after a rejection.
      setStep("proof");
    }
    lastStatusRef.current = sub.status;
    lastProofStatusRef.current = latestProof?.status ?? null;
  }, [sub]);

  // State-machine auto-route based on the server's subscription status.
  // Fires once per mount; the cancelled / active branches navigate away
  // from this route entirely.
  useEffect(() => {
    if (!sub || autoRoutedRef.current) return;
    const status = sub.status;
    const slug = sub.tenants?.slug as string | undefined;
    if (status === "cancelled") {
      autoRoutedRef.current = true;
      toast.message("This checkout was cancelled.");
      void navigate({ to: "/dashboard" });
      return;
    }
    if (status === "active" && slug) {
      autoRoutedRef.current = true;
      void navigate({ to: "/store/$slug/overview", params: { slug } });
      return;
    }
    if (status === "pending_review") {
      autoRoutedRef.current = true;
      setStep("pending");
      return;
    }
    // pending_payment → stay on the wizard (review/instructions/proof).
    autoRoutedRef.current = true;
  }, [sub, navigate]);

  // FX rate is server-authoritative. No silent fallback — if it failed to
  // load, the checkout cannot quote an EGP total, and the "Continue" button
  // is disabled until the query resolves.
  const fxRate: number | null = fxData?.rate ?? null;
  const fxLoading = fxLoadingQuery && !fxError;
  const fxUnavailable = !!fxError;
  // Live price is the source of truth for what the user will pay; the
  // snapshot from onboarding is shown only when it drifted.
  const livePriceUsd: number | null =
    (checkout as any)?.livePriceUsd ?? (sub?.plans?.price_usd ? Number(sub.plans.price_usd) : null);
  const snapshotPriceUsd: number | null = (checkout as any)?.priceSnapshotUsd ?? livePriceUsd;
  const priceChanged: boolean = !!(checkout as any)?.priceChanged;
  const planRemoved: boolean = !!(checkout as any)?.planRemoved;
  const usd = livePriceUsd ?? 0;
  const subCurrency: string = (sub?.currency as string) || "USD";
  const egp = fxRate ? usd * fxRate : 0;
  const egpLabel = fxRate
    ? fmtEgp(egp)
    : fxLoading
      ? "…"
      : "EGP unavailable";
  const usdLabel = formatMoney(usd, subCurrency, "en-US");
  const selectedMethod = (methodsData?.methods ?? []).find((m: any) => m.id === methodId);
  const referenceCode: string = (checkout as any)?.referenceCode ?? "";
  const instructionsEmailLastSentAt: string | null =
    (checkout as any)?.instructionsEmailLastSentAt ?? null;

  // Tick down the resend cooldown each second. Restarts whenever the
  // server-returned `instructionsEmailLastSentAt` advances (e.g. after a
  // successful resend triggers a refetch).
  useEffect(() => {
    if (!instructionsEmailLastSentAt) {
      setCooldownSec(0);
      return;
    }
    const RESEND_COOLDOWN = 60;
    const compute = () => {
      const ageSec = Math.floor(
        (Date.now() - new Date(instructionsEmailLastSentAt).getTime()) / 1000,
      );
      return Math.max(0, RESEND_COOLDOWN - ageSec);
    };
    setCooldownSec(compute());
    const id = window.setInterval(() => {
      const v = compute();
      setCooldownSec(v);
      if (v === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [instructionsEmailLastSentAt]);

  // Re-validate the subscription on window focus so a user with two tabs
  // open (paid in one, kept this one open) doesn't see a stale "still
  // pending" screen — the next focus reads fresh status and the state
  // machine above auto-routes off the wizard.
  useEffect(() => {
    const onFocus = () => { void refetchCheckout(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetchCheckout]);

  if (isLoading) {
    return (
      <PlatformShell>
        <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">Loading checkout…</div>
      </PlatformShell>
    );
  }

  if (checkoutError || !sub) {
    const parsed = checkoutError
      ? parseCheckoutError(checkoutError)
      : ({ code: "TRANSIENT", message: "We couldn't load this checkout." } as ParsedCheckoutError);
    const isNotFound = parsed.code === "NOT_FOUND";
    const isForbidden = parsed.code === "FORBIDDEN";
    const heading = isNotFound
      ? "Checkout not found"
      : isForbidden
        ? "You don't have access to this checkout"
        : "Failed to load checkout";
    const body = isNotFound
      ? "This subscription may have been cancelled, or the link is no longer valid."
      : isForbidden
        ? "Only the store owner can view this checkout. If you think this is wrong, sign in with the owner account."
        : parsed.message || "Something went wrong loading this page. Please retry in a moment.";
    return (
      <PlatformShell>
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm"
          >
            <h2 className="text-base font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="size-4" />
              {heading}
            </h2>
            <p className="mt-2 text-muted-foreground">{body}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!isNotFound && !isForbidden && (
                <Button onClick={() => void refetchCheckout()}>Retry</Button>
              )}
              <Button variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>
                Back to dashboard
              </Button>
            </div>
          </div>
        </div>
      </PlatformShell>
    );
  }

  const goTo = (next: StepId) => setStep(next);

  // Trigger the confirmation dialog instead of submitting directly.
  const onRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!methodId) {
      toast.error("Pick a payment method");
      return;
    }
    if (!reference.trim()) {
      toast.error("Enter your transaction reference");
      return;
    }
    setConfirmSubmit(true);
  };

  const onSubmitProof = async () => {
    if (!methodId) {
      toast.error("Pick a payment method");
      return;
    }
    setBusy(true);
    try {
      let screenshotPath: string | undefined;
      if (file) {
        setUploading(true);
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) throw new Error("Not signed in");
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${uid}/${subscriptionId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-proofs")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        screenshotPath = path;
        setUploading(false);
      }
      // Server recomputes amountUsd / amountEgp / fxRate from the plan and
      // live FX table. The client must NOT send those — anything we'd put
      // here would be ignored anyway, and including them invites confusion.
      await submit({
        data: {
          subscriptionId,
          paymentMethodId: methodId,
          referenceNumber: reference.trim(),
          screenshotPath,
          notes: notes || undefined,
        },
      });
      toast.success("Proof submitted — we'll review within 24 hours.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["checkout", subscriptionId] }),
        queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["my-tenants-stats"] }),
      ]);
      setFile(null);
      setReference("");
      setNotes("");
      goTo("pending");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit proof");
    } finally {
      setUploading(false);
      setBusy(false);
      setConfirmSubmit(false);
    }
  };

  /**
   * Resilient copy-to-clipboard. Falls back to a hidden textarea +
   * `document.execCommand("copy")` in insecure contexts (HTTP, older
   * browsers, in-app webviews) where `navigator.clipboard` is unavailable.
   * Returns true when the value made it into the clipboard, so callers can
   * decide whether to surface the manual-copy hint instead.
   */
  const copy = async (text: string): Promise<boolean> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success("Copied");
        return true;
      }
    } catch {
      // fall through to legacy path
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        toast.success("Copied");
        return true;
      }
    } catch {
      // ignore
    }
    toast.error("Copy unavailable — long-press to select and copy manually.");
    return false;
  };



  const onEditProof = () => {
    void (async () => {
      try {
        await supersede({ data: { subscriptionId } });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["checkout", subscriptionId] }),
          queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
          queryClient.invalidateQueries({ queryKey: ["my-tenants-stats"] }),
        ]);
        setStep("instructions");
        toast.message("Previous proof cleared — submit your new details.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not edit proof");
      }
    })();
  };

  const onCancelCheckout = async () => {
    setCancelling(true);
    try {
      await cancelSub({ data: { subscriptionId } });
      toast.success("Checkout cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["my-tenants"] });
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const onResendEmail = async () => {
    if (cooldownSec > 0 || resendingEmail) return;
    setResendingEmail(true);
    try {
      const res: any = await resendEmail({ data: { subscriptionId } });
      toast.success("Instructions sent — check your inbox.", {
        description: res?.recipient ? `Delivered to ${res.recipient}.` : undefined,
      });
      await refetchCheckout();
    } catch (err) {
      let code = "TRANSIENT";
      let message = "Couldn't send the email. Try again in a moment.";
      let retryAfter = 0;
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.code === "string") code = parsed.code;
            if (typeof parsed.message === "string") message = parsed.message;
            if (typeof parsed.retryAfterSeconds === "number") retryAfter = parsed.retryAfterSeconds;
          } else {
            message = err.message;
          }
        } catch {
          message = err.message;
        }
      }
      if (code === "RATE_LIMITED") {
        if (retryAfter > 0) setCooldownSec(retryAfter);
        toast.info(message);
      } else if (code === "WRONG_STATUS") {
        toast.message(message);
        await refetchCheckout(); // auto-route to the right step
      } else if (code === "EMAIL_NOT_CONFIGURED" || code === "NO_RECIPIENT") {
        toast.error(message);
      } else {
        toast.error(message);
      }
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <PlatformShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Stepper current={step} />
          {!isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel checkout
            </Button>
          )}
        </div>

        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title="Cancel this checkout?"
          description="Your pending subscription will be cancelled. You can start a new one anytime from the dashboard."
          confirmLabel="Yes, cancel"
          destructive
          loading={cancelling}
          onConfirm={onCancelCheckout}
        />

        <ConfirmDialog
          open={confirmSubmit}
          onOpenChange={setConfirmSubmit}
          title="Submit this proof for review?"
          description={
            `Method: ${selectedMethod?.label ?? "—"} · Reference: ${reference || "—"} · ` +
            `Amount: ${egpLabel}` +
            (file ? " · Screenshot attached" : " · No screenshot attached") +
            ". Make sure your reference matches what your bank or wallet shows."
          }
          confirmLabel={busy ? "Submitting…" : "Submit proof"}
          loading={busy}
          onConfirm={() => { void onSubmitProof(); }}
        />


        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">
          <div className="rounded-lg border border-border bg-card p-6">
            {fxUnavailable && step !== "pending" && (
              <div
                role="alert"
                className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                Live FX rate is currently unavailable. Please retry in a moment
                — we can't quote an EGP total without it.
              </div>
            )}

            {step === "review" && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Review your order</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Confirm what you're subscribing to.</p>
                  </div>
                  <Link
                    to="/onboarding"
                    
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3" />
                    Back to plan selection
                  </Link>
                </div>

                {priceChanged && snapshotPriceUsd != null && livePriceUsd != null && (
                  <div
                    role="alert"
                    className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                  >
                    <p className="font-medium text-foreground">Price updated since you started</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      New total: <span className="font-medium text-foreground">{formatMoney(livePriceUsd, subCurrency, "en-US")}</span>
                      {" · "}original: {formatMoney(snapshotPriceUsd, subCurrency, "en-US")}.
                      You will be charged the new amount.
                    </p>
                  </div>
                )}

                {planRemoved && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
                  >
                    <p className="font-medium text-destructive">This plan is no longer available</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Please choose a different plan to continue your subscription.
                    </p>
                  </div>
                )}

                <div className="rounded-md border border-border p-4 min-h-[88px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{sub.plans?.name ?? "Plan unavailable"}</div>
                      <div className="text-xs text-muted-foreground">
                        {sub.tenants?.name}
                        {sub.plans?.interval ? ` · billed ${sub.plans.interval}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{usdLabel}</div>
                      <div className="text-xs text-muted-foreground">≈ {egpLabel}</div>
                    </div>
                  </div>
                </div>

                {planRemoved ? (
                  <Link to="/onboarding"  className="block">
                    <Button className="w-full" variant="default">
                      Choose a different plan
                    </Button>
                  </Link>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => goTo("instructions")}
                    disabled={fxLoading || fxUnavailable}
                  >
                    {fxLoading ? "Loading FX rate…" : "Continue"}
                  </Button>
                )}
              </div>
            )}

            {step === "instructions" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Payment instructions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Transfer the amount below using any of these methods, then submit your proof.
                  </p>
                </div>

                {/* Reference + amount header — single source of truth for what
                    the user owes and how to identify the payment. Min-height
                    reserves layout to prevent CLS while bank config loads. */}
                <div
                  className="rounded-lg border border-border bg-accent/40 p-4 min-h-[140px]"
                  aria-label="Payment summary"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Reference code
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-base font-semibold break-all">
                          {referenceCode || "—"}
                        </span>
                        {referenceCode && (
                          <CopyButton
                            value={referenceCode}
                            onCopy={copy}
                            ariaLabel="Copy reference code"
                          />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Include this on your transfer so we can match it to your subscription.
                      </p>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Amount due
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-base font-semibold">{egpLabel}</span>
                        <span className="text-xs text-muted-foreground">({usdLabel})</span>
                        {fxRate && (
                          <CopyButton
                            value={String(Math.round(egp * 100) / 100)}
                            onCopy={copy}
                            ariaLabel="Copy amount due"
                          />
                        )}
                      </div>
                      {!fxRate && fxLoading && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Loading live FX rate…</p>
                      )}
                    </div>
                  </div>
                  {!clipboardSupported && referenceCode && (
                    <div className="mt-3">
                      <ManualCopyField value={referenceCode} label="Reference code" />
                    </div>
                  )}
                </div>

                {/* Resend instructions to email */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    Switching devices? Email these instructions to yourself.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={resendingEmail || cooldownSec > 0}
                    onClick={() => { void onResendEmail(); }}
                  >
                    <Mail className="size-3 mr-1.5" />
                    {resendingEmail
                      ? "Sending…"
                      : cooldownSec > 0
                        ? `Resend in ${cooldownSec}s`
                        : "Resend to my email"}
                  </Button>
                </div>

                <div className="space-y-3">
                  {(methodsData?.methods ?? []).length === 0 ? (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm text-center"
                    >
                      <p className="font-medium text-destructive">No payment methods are currently configured</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Please contact support so we can complete your subscription.
                      </p>
                    </div>
                  ) : (
                    (methodsData?.methods ?? []).map((m: any) => {
                      const selected = m.id === methodId;
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => setMethodId(m.id)}
                          className={
                            "w-full text-left rounded-md border p-4 transition-colors " +
                            (selected ? "border-foreground bg-accent" : "border-border hover:bg-accent/50")
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{m.label}</div>
                            <span className="text-xs uppercase tracking-wider text-muted-foreground">{m.kind.replace("_", " ")}</span>
                          </div>
                          {selected && (
                            <div className="mt-3 space-y-2 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Account / IBAN</span>
                                <span className="font-mono break-all">{m.account_identifier}</span>
                                <CopyButton
                                  value={m.account_identifier}
                                  onCopy={copy}
                                  ariaLabel={`Copy ${m.label} account number`}
                                />
                              </div>
                              {m.account_holder && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Beneficiary</span>
                                  <span>{m.account_holder}</span>
                                </div>
                              )}
                              {m.instructions && <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{m.instructions}</p>}
                              {!clipboardSupported && (
                                <ManualCopyField
                                  value={m.account_identifier}
                                  label={`${m.label} account`}
                                />
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => goTo("review")}>
                    <ArrowLeft className="size-3 mr-1.5" /> Back to review
                  </Button>
                  <Button
                    disabled={!methodId || (methodsData?.methods ?? []).length === 0}
                    onClick={() => goTo("proof")}
                  >
                    I've paid — continue
                  </Button>
                </div>
              </div>
            )}


            {step === "proof" && (
              <form onSubmit={onRequestSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold">Submit your proof</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter the transaction reference shown in your bank or wallet app.
                  </p>
                </div>
                {latestProofStatus === "rejected" && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
                  >
                    <p className="font-medium text-destructive">Your previous proof was rejected</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Please double-check your transaction reference and resubmit.
                    </p>
                  </div>
                )}
                <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                  Paying with <span className="text-foreground font-medium">{selectedMethod?.label}</span> ·
                  Amount <span className="text-foreground font-medium">{egpLabel}</span> ({fmtUsd(usd)})
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ref">Transaction reference / SMS code</Label>
                  <Input id="ref" required minLength={3} maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 982341" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea id="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sender name, time of transfer, etc." />
                </div>
                <div className="space-y-2">
                  <Label>Receipt screenshot (optional)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 5 * 1024 * 1024) {
                        toast.error("Max file size is 5 MB.");
                        return;
                      }
                      setFile(f);
                    }}
                  />
                  {file ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                      <span className="truncate text-foreground">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove file"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground hover:bg-accent/40 transition-colors"
                    >
                      <Upload className="size-4" />
                      Upload screenshot (PNG, JPG, WebP, PDF · max 5MB)
                    </button>
                  )}
                </div>
                <div className="flex justify-between">
                  <Button type="button" variant="ghost" onClick={() => goTo("instructions")}>Back</Button>
                  <Button type="submit" disabled={busy}>
                    {uploading ? "Uploading…" : busy ? "Submitting…" : "Submit for review"}
                  </Button>
                </div>
              </form>
            )}

            {step === "pending" && (
              <div className="space-y-5 text-center py-8">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-foreground">
                  {isActive ? <Check className="size-5" /> : <Clock className="size-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    {isActive ? "Your subscription is active" : "We received your payment proof"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isActive
                      ? "Your store is live. Manage it from your dashboard."
                      : "Our team will verify your transaction within 24 hours. You'll get an email when it's approved."}
                  </p>
                  {pendingProof && !isActive && (
                    <div className="mt-5 mx-auto max-w-sm rounded-md border border-border bg-muted/20 p-3 text-left text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{pendingProof.reference_number}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{new Date(pendingProof.created_at).toLocaleString()}</span></div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {!isActive && pendingProof && (
                    <Button variant="outline" onClick={onEditProof}>Edit / resend proof</Button>
                  )}
                  <Link to="/dashboard">
                    <Button variant={isActive ? "default" : "ghost"}>Go to dashboard</Button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-border bg-card p-5 text-sm">
            <h3 className="font-semibold">Summary</h3>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Store</dt>
                <dd className="font-medium">{sub.tenants?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium">{sub.plans?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Billing</dt>
                <dd className="font-medium capitalize">{sub.plans?.interval}</dd>
              </div>
              <div className="my-2 h-px bg-border" />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total (USD)</dt>
                <dd className="font-semibold">{fmtUsd(usd)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">≈ in EGP</dt>
                <dd>{egpLabel}</dd>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {fxRate
                  ? `FX rate: 1 USD ≈ ${fxRate.toFixed(2)} EGP`
                  : fxLoading
                    ? "Loading live FX rate…"
                    : "FX rate unavailable"}
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </PlatformShell>
  );
}
