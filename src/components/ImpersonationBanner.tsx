import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert, LogOut } from "lucide-react";
import { useImpersonation } from "@/hooks/useImpersonation";
import { stopImpersonation } from "@/lib/impersonation.functions";
import { Button } from "@/components/ui/button";

function fmtRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function ImpersonationBanner() {
  const { state, isImpersonating } = useImpersonation();
  const stopFn = useServerFn(stopImpersonation);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isImpersonating) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isImpersonating]);

  const stopMut = useMutation({
    mutationFn: () => stopFn(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["impersonation-state"] });
      await qc.invalidateQueries();
      navigate({ to: "/admin/tenants" });
    },
  });

  if (!state) return null;
  const remainingMs = state.exp - now;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 w-full bg-destructive text-destructive-foreground border-b border-destructive/50 shadow-sm"
    >
      <div className="mx-auto max-w-7xl px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
        <ShieldAlert className="size-4 shrink-0" aria-hidden />
        <span className="font-medium">
          Impersonating <span className="font-semibold">{state.tenantName}</span>
          {state.asUserEmail && (
            <span className="opacity-90"> as {state.asUserEmail}</span>
          )}
        </span>
        <span className="rounded bg-background/15 px-1.5 py-0.5 text-xs uppercase tracking-wide">
          Read Only
        </span>
        <span className="text-xs opacity-80 tabular-nums">
          expires in {fmtRemaining(remainingMs)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto h-7"
          onClick={() => stopMut.mutate()}
          disabled={stopMut.isPending}
        >
          <LogOut className="size-3.5 mr-1" />
          {stopMut.isPending ? "Exiting…" : "Exit impersonation"}
        </Button>
      </div>
    </div>
  );
}