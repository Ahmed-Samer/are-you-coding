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
import { UploadProofStep } from "@/components/checkout/UploadProofStep";
import { createProofUploadUrl, finalizeProofUpload } from "@/lib/checkout-proof.functions";

export const Route = createFileRoute("/_authenticated/checkout/$subscriptionId")({
  head: () => ({ meta: [{ title: "Checkout — RentWebify" }] }),
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

  const fetchCheckout = useServerFn(getCheckoutContext);
  const fetchMethods = useServerFn(listPaymentMethods);
  const fetchFx = useServerFn(getCurrentFxRate);
  const submit = useServerFn(submitPaymentProof);
  const cancelSub = useServerFn(cancelPendingSubscription);
  const supersede = useServerFn(supersedePendingProof);
  const resendEmail = useServerFn(resendBankInstructionsEmail);
  const requestUploadUrl = useServerFn(createProofUploadUrl);
  const finalizeUpload = useServerFn(finalizeProofUpload);

  const { data: checkout, isLoading, error: checkoutError, refetch: refetchCheckout } = useQuery({
    queryKey: ["checkout", subscriptionId],
    queryFn: () => fetchCheckout({ data: { subscriptionId } }),
    retry: (count, err) => {
      const parsed = parseCheckoutError(err);
      if (parsed.code === "NOT_FOUND" || parsed.code === "FORBIDDEN") return false;
      return count < 1;
    },
    refetchInterval: (q) => {
      const data: any = q.state.data;
      const status = data?.subscription?.status;
      const hasPending = (data?.subscription?.payment_proofs ?? []).some((p: any) => p.status === "pending");
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
  const isCancelled = sub?.status === "cancelled";
  const isExpired = sub?.status === "expired";

  const initialStep: StepId = isActive
    ? "pending"
    : isCancelled
    ? "review"
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

  const clipboardSupported = useMemo(() => {
    if (typeof navigator === "undefined") return true;
    return !!(navigator.clipboard && typeof window !== "undefined" && window.isSecureContext);
  }, []);

  useEffect(() => {
    if (!sub) return;
    const proofs = sub.payment_proofs ?? [];
    const latestProof = proofs[0];
    if (lastStatusRef.current && lastStatusRef.current !== sub.status && sub.status === "active") {
      toast.success("Your subscription is active", {
        description: "You can now deploy stores from your dashboard.",
      });
    }
    if (
      lastProofStatusRef.current === "pending" &&
      latestProof?.status === "rejected"
    ) {
      toast.error("Your payment proof was rejected", { description: "Please review your details and resubmit." });
      setStep("proof");
    }
    lastStatusRef.current = sub.status;
    lastProofStatusRef.current = latestProof?.status ?? null;
  }, [sub]);

  useEffect(() => {
    if (!sub || autoRoutedRef.current) return;
    const status = sub.status;
    if (status === "cancelled") {
      autoRoutedRef.current = true;
      toast.message("This checkout was cancelled.");
      void navigate({ to: "/dashboard" });
      return;
    }
    if (status === "expired") {
      autoRoutedRef.current = true;
      toast.message("This checkout expired. Start a new one from the dashboard.");
      void navigate({ to: "/dashboard" });
      return;
    }
    if (status === "active") {
      // In the new flow, account subscriptions are activated by admin
      // approval of a payment proof. After activation the user goes to the
      // dashboard to deploy their first store — there is no pre-existing
      // tenant to "open" anymore.
      autoRoutedRef.current = true;
      void navigate({ to: "/dashboard" });
      return;
    }
    if (status === "pending_review") {
      autoRoutedRef.current = true;
      setStep("pending");
      return;
    }
    autoRoutedRef.current = true;
  }, [sub, navigate]);

  const fxRate: number | null = fxData?.rate ?? null;
  const fxLoading = fxLoadingQuery && !fxError;
  const fxUnavailable = !!fxError;

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
        queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] }),
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

  const copy = async (text: string): Promise<boolean> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success("Copied");
        return true;
      }
    } catch {
      // fall through
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
          queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] }),
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] }),
      ]);
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
        await refetchCheckout();
      } else if (code === "EMAIL_NOT_CONFIGURED" || code === "NO_RECIPIENT") {
        toast.error(message);
      } else {
        toast.error(message);
      }
    } finally {
      setResendingEmail(false);
    }
  };

  // Cancelled / expired subscription state — show a clear message and route
  // the user back to the dashboard so they can start a fresh checkout.
  if (isCancelled || isExpired) {
    return (
      <PlatformShell>
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div
            role="alert"
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-sm"
          >
            <h2 className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              {isCancelled ? "This checkout was cancelled" : "This checkout has expired"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {isCancelled
                ? "You cancelled this checkout before submitting payment proof. Start a new subscription from the dashboard to continue."
                : "This subscription is no longer active. Start a new subscription from the dashboard to continue."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => navigate({ to: "/onboarding" })}>
                Start a new subscription
              </Button>
              <Button variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>
                Back to dashboard
              </Button>
            </div>
          </div>
        </div>
      </PlatformShell>
    );
  }

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
                    <h2 className="text-lg font-semibold">Review your subscription</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Confirm the plan you'd like to activate on your account.
                    </p>
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
                        {sub.plans?.interval ? `Billed ${sub.plans.interval}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{usdLabel}</div>
                      <div className="text-xs text-muted-foreground">≈ {egpLabel}</div>
                    </div>
                  </div>
                </div>

                {planRemoved ? (
                  <Link to="/onboarding" className="block">
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
                        Please contact support on <strong>01226399207</strong> so we can complete your subscription.
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
              <UploadProofStep
                referenceCode={referenceCode}
                selectedMethodLabel={selectedMethod?.label ?? null}
                selectedMethodId={methodId || null}
                amountLabel={egpLabel}
                usdLabel={fmtUsd(usd)}
                initialReference={reference}
                initialNotes={notes}
                showRejectedNotice={latestProofStatus === "rejected"}
                onBack={() => goTo("instructions")}
                onRequestUploadUrl={async ({ contentType, byteSize }) => {
                  const res: any = await requestUploadUrl({
                    data: { subscriptionId, contentType, byteSize },
                  });
                  return { uploadUrl: res.uploadUrl, storagePath: res.storagePath };
                }}
                onFinalize={async (input) => {
                  await finalizeUpload({
                    data: {
                      subscriptionId,
                      storagePath: input.storagePath,
                      declaredContentType: input.declaredContentType,
                      paymentMethodId: input.paymentMethodId,
                      referenceNumber: input.referenceNumber,
                      notes: input.notes,
                    },
                  });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["checkout", subscriptionId] }),
                    queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
                    queryClient.invalidateQueries({ queryKey: ["my-tenants-stats"] }),
                    queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] }),
                  ]);
                }}
                onSuccess={() => {
                  toast.success("Proof submitted — we'll review within 24 hours.");
                  setReference("");
                  setNotes("");
                  setFile(null);
                  goTo("pending");
                }}
              />
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
                      ? "You're all set. Head to your dashboard to deploy your first store."
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
                  {isActive && (
                    <Link to="/new-store">
                      <Button>Deploy your first store</Button>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-border bg-card p-5 text-sm">
            <h3 className="font-semibold">Summary</h3>
            <dl className="mt-4 space-y-2">
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
