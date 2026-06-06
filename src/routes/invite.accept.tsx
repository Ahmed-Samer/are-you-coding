import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail, ShieldAlert, ShieldCheck, ShieldX, Clock } from "lucide-react";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { useSession, useUser } from "@/lib/auth-context";
import { acceptTenantInvite, type AcceptInviteResult } from "@/lib/rbac.functions";
import { safeRedirect } from "@/lib/safe-redirect";

const searchSchema = z.object({
  token: z.string().trim().min(10).max(200).optional(),
});

export const Route = createFileRoute("/invite/accept")({
  head: () => ({ meta: [{ title: "Accept invitation — RentWebify" }] }),
  validateSearch: searchSchema,
  component: AcceptInvitePage,
});

/**
 * Build the safe round-trip path used as the `redirect=` value when bouncing
 * the user through /login or /signup. Always passes through `safeRedirect`
 * to prevent open-redirect abuse — same guarantee as the Auth batch.
 */
function buildSafeReturnPath(token: string): string {
  const raw = `/invite/accept?token=${encodeURIComponent(token)}`;
  return safeRedirect(raw) ?? "/dashboard";
}

/**
 * Single shell used by EVERY branch (loading, accepting, success, errors).
 * Keeping the outer container identical eliminates layout shift between
 * phases. The heading owns focus on every branch swap (`tabIndex={-1}` +
 * a ref the parent re-focuses on key change).
 */
function InviteCard({
  branchKey,
  icon,
  title,
  children,
  ariaLive,
}: {
  branchKey: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  ariaLive?: "polite" | "off";
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [branchKey]);

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div
        className="rounded-lg border border-border bg-card p-8 text-center min-h-[260px] flex flex-col items-center justify-center"
        role="status"
        aria-live={ariaLive ?? "polite"}
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight outline-none"
        >
          {title}
        </h1>
        <div className="mt-3 space-y-4 text-sm text-muted-foreground w-full">{children}</div>
      </div>
    </div>
  );
}

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const user = useUser();
  const { loading, signOut } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const accept = useServerFn(acceptTenantInvite);
  const firedRef = useRef(false);
  const [result, setResult] = useState<AcceptInviteResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (t: string) => accept({ data: { token: t } }) as Promise<AcceptInviteResult>,
    onSuccess: (res) => {
      setResult(res);
      if (res.ok) {
        // Scoped invalidation — preserve unrelated cached data (storefront,
        // marketing, admin lists for OTHER tenants, etc.).
        qc.invalidateQueries({ queryKey: ["tenant-members"] });
        qc.invalidateQueries({ queryKey: ["tenant-list"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success(`You've joined ${res.tenantName}`);
        if (res.tenantSlug) {
          navigate({
            to: "/store/$slug/overview",
            params: { slug: res.tenantSlug },
            replace: true,
          });
        }
        // If slug missing, the success card below renders a fallback CTA
        // instead of leaving the user stranded.
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Couldn't accept invite";
      setFatalError(String(msg));
    },
  });

  // Auto-fire once the session is hydrated and we have both a user + token.
  // Note: this is a CLIENT-ONLY effect — the route has NO loader and NO
  // beforeLoad data fetch, so SSR/prerender never invokes the auth-gated
  // accept call (which would 401 without a session).
  useEffect(() => {
    if (loading || !user || !token || firedRef.current) return;
    firedRef.current = true;
    mut.mutate(token);
  }, [loading, user, token, mut]);

  // -------- render branches (every one wrapped in <InviteCard>) --------

  if (!token) {
    return (
      <PlatformShell>
        <InviteCard
          branchKey="invalid"
          icon={<ShieldX className="size-6 text-destructive" />}
          title="Invalid invite link"
        >
          <p>This link is missing or malformed. Please ask the store owner to resend your invite.</p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/">Back to home</Link>
          </Button>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (loading) {
    return (
      <PlatformShell>
        <InviteCard
          branchKey="loading"
          icon={<Loader2 className="size-6 animate-spin text-muted-foreground" />}
          title="Loading your invite"
          ariaLive="polite"
        >
          <p>Checking your session…</p>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (!user) {
    const redirectBack = buildSafeReturnPath(token);
    return (
      <PlatformShell>
        <InviteCard
          branchKey="signed-out"
          icon={<Mail className="size-6 text-primary" />}
          title="You've been invited"
        >
          <p>
            Sign in or create an account with the email address that received this
            invitation to join the team.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() =>
                navigate({ to: "/login", search: { redirect: redirectBack } })
              }
            >
              Sign in
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                navigate({ to: "/signup", search: { redirect: redirectBack } })
              }
            >
              Create an account
            </Button>
          </div>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (fatalError) {
    const invalid = /INVALID_TOKEN/i.test(fatalError);
    return (
      <PlatformShell>
        <InviteCard
          branchKey={invalid ? "invalid-token" : "fatal"}
          icon={<ShieldX className="size-6 text-destructive" />}
          title={invalid ? "Invalid invite link" : "Couldn't accept invite"}
        >
          <p>
            {invalid
              ? "We couldn't find this invitation. It may have been deleted."
              : fatalError}
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (!result || mut.isPending) {
    return (
      <PlatformShell>
        <InviteCard
          branchKey="accepting"
          icon={<Loader2 className="size-6 animate-spin text-muted-foreground" />}
          title="Accepting your invite"
          ariaLive="polite"
        >
          <p>Just a moment…</p>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (result.ok) {
    // Navigation is in-flight when slug is present; render a brief success
    // card with a fallback CTA in case slug is missing or navigation is
    // blocked (e.g. browser back-stack).
    return (
      <PlatformShell>
        <InviteCard
          branchKey="success"
          icon={<ShieldCheck className="size-6 text-primary" />}
          title="You're in!"
        >
          <p>
            {result.tenantSlug
              ? `Taking you to ${result.tenantName}…`
              : `Welcome to ${result.tenantName}.`}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            {result.tenantSlug ? (
              <Button asChild>
                <Link
                  to="/store/$slug/overview"
                  params={{ slug: result.tenantSlug }}
                >
                  Go to {result.tenantName}
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            )}
          </div>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (result.reason === "rate_limited") {
    return (
      <PlatformShell>
        <InviteCard
          branchKey="rate-limited"
          icon={<Clock className="size-6 text-amber-500" />}
          title="Too many attempts"
        >
          <p>
            We've received too many invite-acceptance requests in a short
            window. Please wait a minute and try again.
          </p>
          <Button
            className="mt-2"
            variant="outline"
            onClick={() => {
              firedRef.current = false;
              setResult(null);
              setFatalError(null);
              if (token) {
                firedRef.current = true;
                mut.mutate(token);
              }
            }}
          >
            Try again
          </Button>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (result.reason === "email_mismatch") {
    const redirectBack = buildSafeReturnPath(token);
    return (
      <PlatformShell>
        <InviteCard
          branchKey="email-mismatch"
          icon={<ShieldAlert className="size-6 text-amber-500" />}
          title="Wrong account"
        >
          <p>
            This invite was sent to{" "}
            <span className="font-medium text-foreground">{result.expectedEmail}</span>.
            You're currently signed in as{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={async () => {
                await signOut();
                navigate({ to: "/login", search: { redirect: redirectBack } });
              }}
            >
              Sign out & switch accounts
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (result.reason === "expired") {
    return (
      <PlatformShell>
        <InviteCard
          branchKey="expired"
          icon={<ShieldX className="size-6 text-destructive" />}
          title="This invite has expired"
        >
          <p>Ask the store owner to send you a fresh invitation.</p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </InviteCard>
      </PlatformShell>
    );
  }

  if (result.reason === "revoked") {
    return (
      <PlatformShell>
        <InviteCard
          branchKey="revoked"
          icon={<ShieldX className="size-6 text-destructive" />}
          title="This invite was revoked"
        >
          <p>The store owner cancelled this invitation. Reach out to them for a new one.</p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </InviteCard>
      </PlatformShell>
    );
  }

  // already_accepted
  return (
    <PlatformShell>
      <InviteCard
        branchKey="already-accepted"
        icon={<ShieldCheck className="size-6 text-primary" />}
        title="Already accepted"
      >
        <p>This invitation has already been used. Head to your dashboard to find the store.</p>
        <Button asChild className="mt-2">
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </InviteCard>
    </PlatformShell>
  );
}
