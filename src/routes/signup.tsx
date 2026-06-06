import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { PasswordStrength } from "@/components/ui/password-strength";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/lib/safe-redirect";
import {
  mapAuthError,
  isDuplicateAccountError,
} from "@/lib/auth-errors";
import {
  preSignupCheck,
  resendSignupConfirmation,
} from "@/lib/auth-throttle.functions";
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

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH)
    .refine(meetsPasswordPolicy, PASSWORD_REQUIREMENT_MESSAGE),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — RentWebify" },
      { name: "description", content: "Create your RentWebify account and launch your online store." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const to = safeRedirect(search.redirect) ?? "/dashboard";
      throw redirect({
        to,
        search: search.plan ? { plan: search.plan } : undefined,
      });
    }
  },
  component: SignupPage,
});

function buildConfirmRedirect(
  redirectTo: string | null,
  plan: string | undefined,
): string {
  if (typeof window === "undefined") return "/dashboard";
  const dest = redirectTo ?? "/dashboard";
  const withPlan = plan
    ? dest + (dest.includes("?") ? "&" : "?") + "plan=" + encodeURIComponent(plan)
    : dest;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(withPlan)}`;
}

// Function stays internal to fix code splitting
function SignupPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/signup" });
  const redirectTo = safeRedirect(search.redirect);
  const plan = search.plan;
  const linkSearch = (() => {
    const s: Record<string, string> = {};
    if (redirectTo) s.redirect = redirectTo;
    if (plan) s.plan = plan;
    return Object.keys(s).length ? s : undefined;
  })();

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);

  const preSignupCheckFn = useServerFn(preSignupCheck);
  const resendConfirmationFn = useServerFn(resendSignupConfirmation);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const formContainerRef = useRef<HTMLDivElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { fullName: "", email: "", password: "" },
  });
  const password = watch("password");
  const fullNameReg = register("fullName");
  const passwordReg = register("password");

  useEffect(() => {
    if (!submittedEmail) firstFieldRef.current?.focus();
  }, [submittedEmail]);

  useEffect(() => {
    if (submittedEmail) return;
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
  }, [submittedEmail]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    setDuplicateNotice(false);

    try {
      await preSignupCheckFn({
        data: { email: v.email, fullName: v.fullName },
      });
    } catch (e) {
      setFormError(mapAuthError(e));
      return;
    }

    const emailRedirectTo = buildConfirmRedirect(redirectTo, plan);

    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo,
        data: { full_name: v.fullName },
      },
    });

    if (error) {
      if (isDuplicateAccountError(error)) {
        setDuplicateNotice(true);
        return;
      }
      const msg = mapAuthError(error);
      setFormError(msg);
      if (
        msg.toLowerCase().includes("password") ||
        msg.toLowerCase().includes("breach")
      ) {
        passwordInputRef.current?.focus();
      }
      return;
    }

    const identities = (data.user as { identities?: unknown[] } | null)
      ?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      setDuplicateNotice(true);
      return;
    }

    setSubmittedEmail(v.email);
    setResendCooldown(30);
  });

  const onGoogle = async () => {
    setBusy(true);
    setFormError(null);
    const redirectUrl = buildConfirmRedirect(redirectTo, plan);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl },
    });
    if (error) {
      setBusy(false);
      setFormError(mapAuthError(error));
    }
  };

  const onResend = async () => {
    if (!submittedEmail || resendCooldown > 0 || resendBusy) return;
    setResendBusy(true);
    try {
      await resendConfirmationFn({
        data: {
          email: submittedEmail,
          redirectTo: buildConfirmRedirect(redirectTo, plan),
        },
      });
      toast.success("Confirmation email re-sent.");
      setResendCooldown(30);
    } catch (e) {
      toast.error(mapAuthError(e));
    } finally {
      setResendBusy(false);
    }
  };

  const onStartOver = () => {
    setSubmittedEmail(null);
    setResendCooldown(0);
    setFormError(null);
    setDuplicateNotice(false);
    reset({ fullName: getValues("fullName"), email: "", password: "" });
  };

  if (submittedEmail) {
    return (
      <PlatformShell>
        <div className="mx-auto max-w-md px-6 py-16">
          <div role="status" aria-live="polite">
            <h1 className="text-2xl font-semibold tracking-tight">
              Check your inbox
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">{submittedEmail}</span>.
              Click the link in that email to activate your account.
            </p>
            <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Didn't get it?</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                <li>Check your spam or promotions folder.</li>
                <li>Make sure the address above is correct.</li>
                <li>Wait a minute — delivery can be delayed.</li>
              </ul>
            </div>
            <div className="mt-6 flex flex-col gap-3">
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
                    : "Resend confirmation email"}
              </Button>
              <Button asChild className="w-full">
                <Link to="/login" search={linkSearch}>
                  Go to sign in
                </Link>
              </Button>
              <button
                type="button"
                onClick={onStartOver}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                Wrong email? Start over
              </button>
            </div>
            <p className="mt-8 text-xs text-muted-foreground">
              Until you confirm, your account stays unverified and you won't be
              able to sign in.
            </p>
          </div>
        </div>
      </PlatformShell>
    );
  }

  const fieldErrorList = Object.entries(errors)
    .map(([k, v]) => v?.message && `${k}: ${v.message}`)
    .filter(Boolean) as string[];

  return (
    <PlatformShell>
      <div ref={formContainerRef} className="mx-auto max-w-md px-6 py-16">
        <div role="status" aria-live="polite" className="sr-only">
          Create account form
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start your free trial. Set up your store in minutes.
        </p>

        <div aria-live="polite" role="alert" className="mt-6 min-h-[2.5rem]">
          {formError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {formError}
            </p>
          ) : fieldErrorList.length > 0 ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Please fix the highlighted fields below.
            </p>
          ) : null}
        </div>

        <div className="min-h-[2.5rem]">
          {duplicateNotice && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              If this email already has an account,{" "}
              <Link
                to="/login"
                search={linkSearch}
                className="font-medium text-foreground hover:underline"
              >
                sign in
              </Link>{" "}
              or{" "}
              <Link
                to="/forgot-password"
                className="font-medium text-foreground hover:underline"
              >
                reset your password
              </Link>
              .
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              {...fullNameReg}
              ref={(el) => {
                fullNameReg.ref(el);
                firstFieldRef.current = el;
              }}
            />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {PASSWORD_REQUIREMENT_MESSAGE}
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || busy}
          >
            {isSubmitting ? "Creating account…" : "Create account"}
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
          Sign up with Google
        </Button>
        <p className="mt-8 text-sm text-muted-foreground text-center">
          Already have an account?{" "}
          <Link
            to="/login"
            search={linkSearch}
            className="text-foreground font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </PlatformShell>
  );
}