import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/safe-redirect";
import { getPostAuthDestination } from "@/lib/auth-callback.functions";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const searchSchema = z.object({
  next: fallback(z.string().optional(), undefined),
  redirect: fallback(z.string().optional(), undefined),
  plan: fallback(z.enum(["starter", "growth", "scale"]).optional(), undefined),
  code: fallback(z.string().optional(), undefined),
  error: fallback(z.string().optional(), undefined),
  error_code: fallback(z.string().optional(), undefined),
  error_description: fallback(z.string().optional(), undefined),
});

const ALLOWED_NEXT_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/checkout",
  "/account",
  "/store/",
];

function allowedNext(raw: string | undefined): string | null {
  const safe = safeRedirect(raw ?? null);
  if (!safe) return null;
  if (!ALLOWED_NEXT_PREFIXES.some((p) => safe === p || safe.startsWith(p))) return null;
  return safe;
}

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Signing you in… — RentWebify" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: AuthCallbackPage,
});

type CallbackStatus =
  | "exchanging"
  | "branching"
  | "redirecting"
  | "error_oauth"
  | "error_expired"
  | "error_timeout"
  | "error_unknown";

const EXCHANGE_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;

function classifyError(params: {
  error?: string;
  errorCode?: string;
}): CallbackStatus {
  const code = (params.errorCode ?? "").toLowerCase();
  const err = (params.error ?? "").toLowerCase();
  if (code === "otp_expired" || code === "expired_token" || err === "access_denied") {
    return "error_expired";
  }
  if (err === "server_error" || err === "temporarily_unavailable" || err.startsWith("oauth")) {
    return "error_oauth";
  }
  if (err || code) return "error_oauth";
  return "error_unknown";
}

function parseHash(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/callback" });
  const getDestination = useServerFn(getPostAuthDestination);

  const [status, setStatus] = useState<CallbackStatus>("exchanging");
  const [errorDescription, setErrorDescription] = useState<string | null>(null);
  const [recoveryType, setRecoveryType] = useState<"signup" | "recovery" | "magiclink" | "invite" | "oauth" | "unknown">(
    "unknown",
  );
  const [retryKey, setRetryKey] = useState(0);

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const hashParams = typeof window !== "undefined" ? parseHash(window.location.hash) : new URLSearchParams();
    const hashError = hashParams.get("error") ?? undefined;
    const hashErrorCode = hashParams.get("error_code") ?? undefined;
    const hashErrorDesc = hashParams.get("error_description") ?? undefined;
    const hashType = hashParams.get("type") ?? undefined;
    if (hashType === "signup" || hashType === "recovery" || hashType === "magiclink" || hashType === "invite") {
      setRecoveryType(hashType);
    }

    const inboundError = search.error ?? hashError;
    const inboundErrorCode = search.error_code ?? hashErrorCode;
    const inboundErrorDesc = search.error_description ?? hashErrorDesc;

    if (inboundError || inboundErrorCode) {
      setErrorDescription(inboundErrorDesc ?? null);
      setStatus(classifyError({ error: inboundError, errorCode: inboundErrorCode }));
      return () => {
        cancelledRef.current = true;
      };
    }

    const branch = async () => {
      if (cancelledRef.current) return;
      setStatus("branching");
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      const explicit = allowedNext(search.next ?? search.redirect);
      if (explicit) {
        // Preserve the plan param when the explicit destination is the
        // onboarding flow, otherwise the user's selected plan is lost across
        // the auth bounce.
        const wantsPlan =
          (explicit === "/onboarding" || explicit.startsWith("/onboarding?")) &&
          !!search.plan;
        const target = wantsPlan
          ? `${explicit}${explicit.includes("?") ? "&" : "?"}plan=${encodeURIComponent(search.plan as string)}`
          : explicit;
        setStatus("redirecting");
        navigate({ to: target as string, replace: true });
        return;
      }

      let target = "/dashboard";
      try {
        const { destination } = await getDestination();
        if (destination === "onboarding") {
          target = search.plan ? `/onboarding?plan=${encodeURIComponent(search.plan)}` : "/onboarding";
        } else {
          target = "/dashboard";
        }
      } catch (err) {
        console.error("[auth-callback] destination resolution failed:", err);
        target = "/dashboard";
      }
      if (cancelledRef.current) return;
      setStatus("redirecting");
      navigate({ to: target as string, replace: true });
    };

    const trySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await branch();
        return true;
      }
      return false;
    };

    void trySession().then((found) => {
      if (found || cancelledRef.current) return;
      const poll = async () => {
        if (cancelledRef.current) return;
        const found = await trySession();
        if (found || cancelledRef.current) return;
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      };
      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    });

    deadlineTimer = setTimeout(() => {
      if (cancelledRef.current) return;
      setStatus((curr) => (curr === "exchanging" ? "error_timeout" : curr));
    }, EXCHANGE_TIMEOUT_MS);

    return () => {
      cancelledRef.current = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
  }, [retryKey]);

  return (
    <PlatformShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-lg border border-border bg-card p-8 min-h-[12rem] flex flex-col">
          {status === "exchanging" || status === "branching" || status === "redirecting" ? (
            <LoadingView status={status} />
          ) : (
            <ErrorView
              status={status}
              description={errorDescription}
              recoveryType={recoveryType}
              search={search}
              onRetry={() => {
                setErrorDescription(null);
                setStatus("exchanging");
                setRetryKey((k) => k + 1);
              }}
            />
          )}
        </div>
        <ScreenReaderAnnouncer status={status} />
      </div>
    </PlatformShell>
  );
}

function LoadingView({ status }: { status: "exchanging" | "branching" | "redirecting" }) {
  const copy = useMemo(() => {
    if (status === "branching") return "Setting things up…";
    if (status === "redirecting") return "Redirecting…";
    return "Signing you in…";
  }, [status]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      <p className="min-h-[1.5rem] text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}

function ErrorView({
  status,
  description,
  recoveryType,
  search,
  onRetry,
}: {
  status: "error_oauth" | "error_expired" | "error_timeout" | "error_unknown";
  description: string | null;
  recoveryType: "signup" | "recovery" | "magiclink" | "invite" | "oauth" | "unknown";
  search: { next?: string; redirect?: string; plan?: "starter" | "growth" | "scale" };
  onRetry: () => void;
}) {
  const loginSearch = useMemo(() => {
    const out: Record<string, string> = {};
    const safeNext = allowedNext(search.next ?? search.redirect);
    if (safeNext) out.redirect = safeNext;
    if (search.plan) out.plan = search.plan;
    return out;
  }, [search.next, search.redirect, search.plan]);

  if (status === "error_expired") {
    const isRecovery = recoveryType === "recovery";
    return (
      <div className="flex flex-1 flex-col gap-4" role="alert">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">This link has expired or was already used</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign-in links are single-use and time-limited. Request a new one to continue.
          </p>
        </div>
        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/login" search={loginSearch as never}>
            <Button variant="outline" className="w-full sm:w-auto">Back to sign in</Button>
          </Link>
          {isRecovery ? (
            <Link to="/forgot-password">
              <Button className="w-full sm:w-auto">Request a new link</Button>
            </Link>
          ) : (
            <Link to="/login" search={loginSearch as never}>
              <Button className="w-full sm:w-auto">Request a new link</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (status === "error_timeout") {
    return (
      <div className="flex flex-1 flex-col gap-4" role="alert">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Taking longer than expected</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn't finish signing you in. Check your connection and try again.
          </p>
        </div>
        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/login" search={loginSearch as never}>
            <Button variant="outline" className="w-full sm:w-auto">Back to sign in</Button>
          </Link>
          <Button className="w-full sm:w-auto" onClick={onRetry}>Try again</Button>
        </div>
      </div>
    );
  }

  if (status === "error_oauth") {
    return (
      <div className="flex flex-1 flex-col gap-4" role="alert">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Sign-in didn't complete</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The sign-in provider cancelled or rejected the request. You can try again or use email.
          </p>
          {description && <p className="mt-2 text-xs text-muted-foreground/80">{description}</p>}
        </div>
        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/">
            <Button variant="outline" className="w-full sm:w-auto">Back to home</Button>
          </Link>
          <Link to="/login" search={loginSearch as never}>
            <Button className="w-full sm:w-auto">Try again</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4" role="alert">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong signing you in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We hit an unexpected error while finalizing your session.
        </p>
        {description && <p className="mt-2 text-xs text-muted-foreground/80">{description}</p>}
      </div>
      <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link to="/">
          <Button variant="outline" className="w-full sm:w-auto">Back to home</Button>
        </Link>
        <Link to="/login" search={loginSearch as never}>
          <Button className="w-full sm:w-auto">Back to sign in</Button>
        </Link>
      </div>
    </div>
  );
}

function ScreenReaderAnnouncer({ status }: { status: CallbackStatus }) {
  const msg =
    status === "exchanging" ? "Signing you in"
      : status === "branching" ? "Preparing your account"
      : status === "redirecting" ? "Redirecting"
      : status === "error_expired" ? "Sign-in link has expired"
      : status === "error_timeout" ? "Sign-in is taking longer than expected"
      : status === "error_oauth" ? "Sign-in didn't complete"
      : "Sign-in failed";
  return (
    <div role="status" aria-live="polite" className="sr-only">{msg}</div>
  );
}