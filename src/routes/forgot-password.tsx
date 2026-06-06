import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirect } from "@/lib/safe-redirect";
import { mapAuthError } from "@/lib/auth-errors";
import { requestPasswordReset } from "@/lib/auth-throttle.functions";

const searchSchema = z.object({
  redirect: z.string().optional(),
  plan: z.string().max(64).optional(),
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});
type FormValues = z.infer<typeof schema>;

const RESEND_COOLDOWN_SECONDS = 60;

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — RentWebify" },
      {
        name: "description",
        content: "Request a password reset link for your RentWebify account.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const search = useSearch({ from: "/forgot-password" });
  const redirectTo = safeRedirect(search.redirect);
  const linkSearch = redirectTo ? { redirect: redirectTo } : undefined;

  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const requestReset = useServerFn(requestPasswordReset);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });
  const emailReg = register("email");

  useEffect(() => {
    if (!submittedEmail) emailInputRef.current?.focus();
  }, [submittedEmail]);

  useEffect(() => {
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
  }, [submittedEmail]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  const buildRedirectTo = () =>
    typeof window === "undefined"
      ? "/reset-password"
      : `${window.location.origin}/reset-password`;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await requestReset({
        data: { email: v.email, redirectTo: buildRedirectTo() },
      });
    } catch (e) {
      setFormError(mapAuthError(e));
      return;
    }
    setSubmittedEmail(v.email);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  });

  const onResend = async () => {
    if (!submittedEmail || resendCooldown > 0 || resendBusy) return;
    setResendBusy(true);
    setFormError(null);
    try {
      await requestReset({
        data: { email: submittedEmail, redirectTo: buildRedirectTo() },
      });
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setFormError(mapAuthError(e));
    } finally {
      setResendBusy(false);
    }
  };

  const onUseDifferentEmail = () => {
    setSubmittedEmail(null);
    setResendCooldown(0);
    setFormError(null);
  };

  return (
    <PlatformShell>
      <div ref={containerRef} className="mx-auto max-w-md px-6 py-16">
        <div role="status" aria-live="polite" className="sr-only">
          {submittedEmail ? "Reset link sent" : "Reset password form"}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {submittedEmail
            ? "We've processed your request."
            : "Enter the email tied to your account and we'll send a reset link."}
        </p>

        <div role="alert" aria-live="polite" className="mt-6 min-h-[2.5rem]">
          {formError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {formError}
            </p>
          )}
        </div>

        {submittedEmail ? (
          <div className="space-y-5">
            <div className="rounded-md border border-border bg-card p-5 text-sm">
              <p className="font-medium text-foreground">Check your inbox</p>
              <p className="mt-1 text-muted-foreground">
                If an account exists for{" "}
                <span className="font-medium text-foreground">
                  {submittedEmail}
                </span>
                , a password reset link is on its way. The link expires after a
                short time — use it as soon as you can.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Check your spam or promotions folder.</li>
                <li>Make sure the address above is correct.</li>
                <li>Resends are rate-limited — give it a minute.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                onClick={onResend}
                disabled={resendCooldown > 0 || resendBusy}
                variant="outline"
                className="w-full"
              >
                {resendBusy
                  ? "Sending…"
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend reset link"}
              </Button>
              <Button asChild className="w-full">
                <Link to="/login" search={linkSearch}>
                  Back to sign in
                </Link>
              </Button>
              <button
                type="button"
                onClick={onUseDifferentEmail}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link
                to="/login"
                search={linkSearch}
                className="text-foreground font-medium hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </PlatformShell>
  );
}