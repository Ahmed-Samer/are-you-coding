import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/components/ui/google-icon";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/safe-redirect";
import { mapAuthError, isUnconfirmedAccountError } from "@/lib/auth-errors";
import {
  checkLoginAllowed,
  getLoginThrottleState,
  recordLoginFailure,
  recordMfaVerify,
  resendSignupConfirmation,
} from "@/lib/auth-throttle.functions";

const LoginMfaChallenge = lazy(() => import("@/components/auth/LoginMfaChallenge"));

const searchSchema = z.object({
  redirect: z.string().optional(),
  plan: z.string().max(64).optional(),
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password is required").max(128),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — RentWebify" },
      { name: "description", content: "Sign in to manage your RentWebify store." },
    ],
  }),
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      const to = safeRedirect(search.redirect) ?? "/dashboard";
      throw redirect({ to });
    }
  },
  component: LoginPage,
});

export function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const redirectTo = safeRedirect(search.redirect);
  const plan = search.plan;
  
  const linkSearch = (() => {
    const s: Record<string, string> = {};
    if (search.redirect) s.redirect = search.redirect;
    if (plan) s.plan = plan;
    return Object.keys(s).length ? s : undefined;
  })();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showResend, setShowResend] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const lastEmail = useRef("");
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const formContainerRef = useRef<HTMLDivElement | null>(null);

  const checkLoginAllowedFn = useServerFn(checkLoginAllowed);
  const getThrottleStateFn = useServerFn(getLoginThrottleState);
  const recordLoginFailureFn = useServerFn(recordLoginFailure);
  const recordMfaVerifyFn = useServerFn(recordMfaVerify);
  const resendConfirmationFn = useServerFn(resendSignupConfirmation);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  const emailReg = register("email");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const syncThrottle = async (email?: string) => {
    try {
      const { retryAfterSec } = await getThrottleStateFn({
        data: { email: email && email.length > 0 ? email : undefined },
      });
      setCooldown(retryAfterSec);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void syncThrottle();
  }, []);

  const cooldownActive = cooldown > 0;
  useEffect(() => {
    if (!cooldownActive) return;
    const id = setInterval(() => {
      void syncThrottle(lastEmail.current || undefined);
    }, 10_000);
    return () => clearInterval(id);
  }, [cooldownActive]);

  useEffect(() => {
    if (!mfa) emailInputRef.current?.focus();
  }, [mfa]);

  useEffect(() => {
    if (mfa) return;
    const node = formContainerRef.current;
    if (!node) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", handler);
    return () => node.removeEventListener("keydown", handler);
  }, [mfa]);

  const completeLogin = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setFormError("We couldn't verify your session. Please sign in again.");
      return;
    }
    toast.success("Welcome back");
    navigate({ to: redirectTo ?? "/dashboard" });
  };

  const maybeChallengeMfa = async (): Promise<boolean> => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f) => f.status === "verified");
      if (totp) {
        const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (error || !ch) {
          setFormError(error?.message ?? "Could not start MFA challenge");
          return true;
        }
        setMfa({ factorId: totp.id, challengeId: ch.id });
        return true;
      }
    }
    return false;
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    if (cooldown > 0) {
      setFormError(`Too many attempts. Try again in ${cooldown}s.`);
      return;
    }
    lastEmail.current = v.email;

    try {
      await checkLoginAllowedFn({ data: { email: v.email } });
    } catch (e) {
      setFormError(mapAuthError(e));
      void syncThrottle(v.email);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: v.email,
      password: v.password,
    });
    if (error) {
      void recordLoginFailureFn({ data: { email: v.email } }).catch(() => {});
      if (isUnconfirmedAccountError(error)) setShowResend(true);
      setFormError(mapAuthError(error));
      void syncThrottle(v.email);
      return;
    }
    if (await maybeChallengeMfa()) return;
    await completeLogin();
  });

  const onVerifyMfa = async () => {
    if (!mfa) return;
    setMfaError(null);
    setMfaBusy(true);
    try {
      await recordMfaVerifyFn();
    } catch (e) {
      setMfaBusy(false);
      setMfaError(mapAuthError(e));
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfa.factorId,
      challengeId: mfa.challengeId,
      code: mfaCode.trim(),
    });
    setMfaBusy(false);
    if (error) {
      setMfaError(mapAuthError(error));
      return;
    }
    setMfa(null);
    setMfaCode("");
    await completeLogin();
  };

  const onCancelMfa = async () => {
    await supabase.auth.signOut();
    setMfa(null);
    setMfaCode("");
    setMfaError(null);
    setFormError("You've been signed out. Please sign in again.");
    toast.info("Signed out. Please try again.");
  };

  const onGoogle = async () => {
    setBusy(true);
    const next = redirectTo ?? "/dashboard";
    const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl },
    });
    if (error) {
      setBusy(false);
      setFormError(mapAuthError(error));
    }
  };

  const onResendConfirmation = async () => {
    const email = lastEmail.current || getValues("email");
    if (!email) return;
    try {
      await resendConfirmationFn({
        data: {
          email,
          redirectTo: window.location.origin + "/dashboard",
        },
      });
      toast.success("Confirmation email re-sent.");
    } catch (e) {
      setFormError(mapAuthError(e));
    }
  };

  if (mfa) {
    return (
      <PlatformShell>
        <Suspense
          fallback={
            <div className="mx-auto max-w-md px-6 py-16">
              <p className="text-sm text-muted-foreground">Loading verification…</p>
            </div>
          }
        >
          <LoginMfaChallenge
            code={mfaCode}
            onChange={setMfaCode}
            onVerify={onVerifyMfa}
            onCancel={onCancelMfa}
            busy={mfaBusy}
            errorMessage={mfaError}
          />
        </Suspense>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell>
      <div ref={formContainerRef} className="mx-auto max-w-md px-6 py-16">
        <div role="status" aria-live="polite" className="sr-only">
          Sign in form
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to manage your store and billing.
        </p>
        <div aria-live="polite" role="alert" className="mt-6 min-h-[2.5rem]">
          {formError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {formError}
            </p>
          ) : null}
        </div>
        <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...emailReg}
              ref={(el) => {
                emailReg.ref(el);
                emailInputRef.current = el;
              }}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                search={linkSearch}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Forgot?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          <div className="min-h-[2.5rem]">
            {cooldown > 0 && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Too many failed attempts. Try again in {cooldown}s.
              </p>
            )}
          </div>
          <div className="min-h-[2.5rem]">
            {showResend && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Didn't receive confirmation email?
                </span>
                <button
                  type="button"
                  onClick={onResendConfirmation}
                  className="font-medium text-foreground hover:underline"
                >
                  Resend
                </button>
              </div>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting || cooldown > 0}>
            {isSubmitting
              ? "Signing in…"
              : cooldown > 0
                ? `Wait ${cooldown}s`
                : "Sign in"}
          </Button>
        </form>
        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={onGoogle}
          disabled={busy || isSubmitting}
        >
          <GoogleIcon className="size-4" />
          Continue with Google
        </Button>
        <p className="mt-8 text-sm text-muted-foreground text-center">
          New here?{" "}
          <Link
            to="/signup"
            search={linkSearch}
            className="text-foreground font-medium hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </PlatformShell>
  );
}