import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrength } from "@/components/ui/password-strength";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/safe-redirect";
import { mapAuthError } from "@/lib/auth-errors";
import {
  meetsPasswordPolicy,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENT_MESSAGE,
} from "@/lib/password-policy";

const searchSchema = z.object({
  redirect: z.string().optional(),
  plan: z.string().max(64).optional(),
});

const schema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH)
      .refine(meetsPasswordPolicy, PASSWORD_REQUIREMENT_MESSAGE),
    confirm: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });
type FormValues = z.infer<typeof schema>;

type RecoveryStatus =
  | "verifying"
  | "ready"
  | "invalid"
  | "submitting"
  | "success";

const VERIFY_TIMEOUT_MS = 10_000;

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — RentWebify" },
      {
        name: "description",
        content: "Set a new password for your RentWebify account.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/reset-password" });
  const successDestination = safeRedirect(search.redirect) ?? "/dashboard";
  const [status, setStatus] = useState<RecoveryStatus>("verifying");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { password: "", confirm: "" },
  });
  const password = watch("password");
  const passwordReg = register("password");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash ?? "";
    const hasError = /[#&](error|error_code)=/.test(hash);
    const looksLikeRecovery =
      hash.includes("type=recovery") && hash.includes("access_token=");

    if (hasError) {
      setStatus("invalid");
      return;
    }
    if (!looksLikeRecovery) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setStatus("invalid");
        } else {
          setStatus("invalid");
        }
      });
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStatus((s) => (s === "verifying" ? "ready" : s));
        if (window.location.hash) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus((s) => (s === "verifying" ? "ready" : s));
        if (window.location.hash) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      }
    });

    const timeout = window.setTimeout(() => {
      setStatus((s) => (s === "verifying" ? "invalid" : s));
    }, VERIFY_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (status === "ready") {
      try {
        setFocus("password");
      } catch {
        passwordInputRef.current?.focus();
      }
    }
  }, [status, setFocus]);

  useEffect(() => {
    if (status !== "ready") return;
    const node = containerRef.current;
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
  }, [status]);

  const onSubmit = handleSubmit(async (v) => {
    setSubmitError(null);
    setStatus("submitting");
    const { error } = await supabase.auth.updateUser({ password: v.password });
    if (error) {
      const raw = (error.message ?? "").toLowerCase();
      if (
        raw.includes("auth session missing") ||
        raw.includes("invalid_grant") ||
        raw.includes("jwt expired") ||
        raw.includes("token has expired") ||
        (error as { status?: number }).status === 401
      ) {
        setStatus("invalid");
        return;
      }
      setSubmitError(mapAuthError(error));
      setStatus("ready");
      passwordInputRef.current?.focus();
      return;
    }
    setStatus("success");
    toast.success("Password updated. You're signed in.");
    navigate({ to: successDestination as string, replace: true });
  });

  const srStatus =
    status === "ready" || status === "submitting"
      ? "New password form"
      : status === "invalid"
        ? "Reset link is invalid or has expired"
        : status === "success"
          ? "Password updated, signing you in"
          : "Verifying reset link";

  return (
    <PlatformShell>
      <div ref={containerRef} className="mx-auto max-w-md px-6 py-16">
        <div role="status" aria-live="polite" className="sr-only">
          {srStatus}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {status === "invalid"
            ? "Reset link is invalid or expired"
            : "Set a new password"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === "invalid"
            ? "This link may have already been used or expired (links are valid for about an hour)."
            : "Choose a strong password you don't use anywhere else."}
        </p>

        <div role="alert" aria-live="polite" className="mt-6 min-h-[2.5rem]">
          {submitError && status !== "invalid" && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}
        </div>

        {status === "verifying" && (
          <div className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground min-h-[10rem]">
            <p className="font-medium text-foreground">
              Verifying your reset link…
            </p>
            <p className="mt-1">
              This usually takes a moment. If nothing happens, the link may be
              invalid or expired.
            </p>
          </div>
        )}

        {status === "invalid" && (
          <div className="space-y-5">
            <div className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground min-h-[10rem]">
              <p className="font-medium text-foreground">What you can do</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                <li>Request a fresh reset link below.</li>
                <li>Check that you opened the most recent email we sent.</li>
                <li>If you remember your password, just sign in.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Button asChild className="w-full">
                <Link to="/forgot-password">Request a new link</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          </div>
        )}

        {(status === "ready" || status === "submitting") && (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...passwordReg}
                ref={(el) => {
                  passwordReg.ref(el);
                  passwordInputRef.current = el;
                }}
              />
              <div className="min-h-[2.25rem]">
                <PasswordStrength value={password ?? ""} />
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {PASSWORD_REQUIREMENT_MESSAGE}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
                {...register("confirm")}
              />
              {errors.confirm && (
                <p className="text-xs text-destructive">
                  {errors.confirm.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || status === "submitting"}
            >
              {isSubmitting || status === "submitting"
                ? "Saving…"
                : "Save new password"}
            </Button>
          </form>
        )}

        {status === "success" && (
          <div className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground min-h-[10rem]">
            Password updated. Redirecting you to your dashboard…
          </div>
        )}
      </div>
    </PlatformShell>
  );
}