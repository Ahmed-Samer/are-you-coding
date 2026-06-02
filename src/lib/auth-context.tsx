import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Split contexts: consumers that only need the user identity (`useUser`) don't
// rerender on session-only changes (token refresh, expiry warning timer reset),
// and vice versa. Both are populated from a single internal auth state listener.

type SessionState = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

type UserState = {
  user: User | null;
};

const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
  signOut: async () => {},
});

const UserContext = createContext<UserState>({ user: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Only invalidate router + query cache on identity changes. TOKEN_REFRESHED
      // fires roughly every 50 minutes per tab and a blanket invalidate causes
      // every loader to re-run, producing visible jank on long-lived sessions.
      //
      // We additionally no-op while the user is on /auth/callback — that route
      // owns the post-auth branching and a concurrent router.invalidate() races
      // its navigate({ replace: true }), producing a transient duplicate render
      // / stale-loader flash on the destination route.
      const onCallback =
        typeof window !== "undefined" &&
        window.location.pathname === "/auth/callback";
      if (
        !onCallback &&
        (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED")
      ) {
        router.invalidate();
        qc.invalidateQueries();
      }
      if (event === "PASSWORD_RECOVERY" && typeof window !== "undefined") {
        // Only hijack navigation while the URL still carries the recovery
        // payload. After Reset Password scrubs the hash and navigates to
        // /dashboard, a late-arriving replay of PASSWORD_RECOVERY (e.g.
        // from a slow tab or token-refresh chain) MUST NOT yank the user
        // back to /reset-password.
        const hasRecoveryHash =
          window.location.hash.includes("type=recovery") &&
          window.location.hash.includes("access_token=");
        if (
          hasRecoveryHash &&
          window.location.pathname !== "/reset-password"
        ) {
          router.navigate({ to: "/reset-password" });
        }
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);

  useEffect(() => {
    if (!session?.expires_at) return;
    const msUntilWarn = session.expires_at * 1000 - Date.now() - 2 * 60_000;
    if (msUntilWarn <= 0) return;
    const warnTimer = window.setTimeout(() => {
      toast.warning("Your session is about to expire", {
        description: "Stay signed in to keep working.",
        duration: 30_000,
        action: {
          label: "Stay signed in",
          onClick: async () => {
            const { error } = await supabase.auth.refreshSession();
            if (error) toast.error("Couldn't refresh session. Please sign in again.");
            else toast.success("Session extended");
          },
        },
      });
    }, msUntilWarn);
    return () => window.clearTimeout(warnTimer);
  }, [session?.expires_at]);

  // Stable user reference: only changes when the user id itself changes,
  // so UserContext consumers don't rerender on token refresh.
  const user = session?.user ?? null;
  const userValue = useMemo<UserState>(() => ({ user }), [user?.id ?? null]);

  const sessionValue = useMemo<SessionState>(
    () => ({
      session,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <UserContext.Provider value={userValue}>{children}</UserContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export function useUser() {
  return useContext(UserContext).user;
}

// Legacy combined hook — retained for backwards compatibility. Prefer
// `useSession` or `useUser` in new code.
export function useAuth() {
  const s = useContext(SessionContext);
  const u = useContext(UserContext);
  return { ...s, user: u.user };
}
