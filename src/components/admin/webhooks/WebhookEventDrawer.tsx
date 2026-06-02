import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { toast } from "@/lib/toast";
import {
  getWebhookEvent,
  retryWebhookEvent,
  markWebhookEventDead,
  setEndpointActive,
} from "@/lib/webhooks-admin.functions";

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    pending: "bg-muted text-foreground",
    in_flight: "bg-blue-500/15 text-blue-700",
    succeeded: "bg-emerald-500/15 text-emerald-700",
    failed: "bg-amber-500/15 text-amber-700",
    dead: "bg-destructive/15 text-destructive",
  };
  return (
    <Badge variant="outline" className={tone[status]}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export function WebhookEventDrawer({
  eventId,
  onOpenChange,
  onChanged,
}: {
  eventId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [confirmDead, setConfirmDead] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "webhooks", "event", eventId],
    queryFn: () => getWebhookEvent({ data: { eventId: eventId! } }),
    enabled: !!eventId,
  });

  const retryMut = useMutation({
    mutationFn: () => retryWebhookEvent({ data: { eventId: eventId! } }),
    onSuccess: () => {
      toast.success("Event re-queued");
      qc.invalidateQueries({ queryKey: ["admin", "webhooks"] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deadMut = useMutation({
    mutationFn: () =>
      markWebhookEventDead({ data: { eventId: eventId!, reason: "Manually marked dead by admin" } }),
    onSuccess: () => {
      toast.success("Event marked dead");
      setConfirmDead(false);
      qc.invalidateQueries({ queryKey: ["admin", "webhooks"] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disableMut = useMutation({
    mutationFn: (endpointId: string) =>
      setEndpointActive({
        data: { endpointId, isActive: false, reason: "Disabled from event drawer" },
      }),
    onSuccess: () => {
      toast.success("Endpoint disabled");
      setConfirmDisable(false);
      qc.invalidateQueries({ queryKey: ["admin", "webhooks"] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const e = q.data?.event;
  const attempts = q.data?.attempts ?? [];

  return (
    <Sheet open={!!eventId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Webhook event</SheetTitle>
          <SheetDescription>
            Inspect the payload, delivery history, and trigger a manual retry.
          </SheetDescription>
        </SheetHeader>

        {q.isLoading && (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        )}

        {e && (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-0.5"><StatusBadge status={e.status} /></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Attempts</div>
                <div className="mt-0.5 font-medium tabular-nums">{e.attemptCount}/6</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Event</div>
                <div className="mt-0.5 font-mono text-xs">{e.eventType}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Endpoint</div>
                <div className="mt-0.5 text-xs break-all">{e.endpointUrl}</div>
                {!e.endpointActive && (
                  <Badge variant="outline" className="mt-1 bg-destructive/15 text-destructive">
                    disabled
                  </Badge>
                )}
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Tenant</div>
                <div className="mt-0.5">{e.tenantName ?? e.tenantId}</div>
              </div>
              {e.lastError && (
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">Last error</div>
                  <div className="mt-0.5 text-xs text-destructive">{e.lastError}</div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={retryMut.isPending || e.status === "in_flight"}
                onClick={() => retryMut.mutate()}
              >
                {retryMut.isPending ? "Retrying…" : "Retry now"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={e.status === "dead"}
                onClick={() => setConfirmDead(true)}
              >
                Mark dead
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!e.endpointActive}
                onClick={() => setConfirmDisable(true)}
              >
                Disable endpoint
              </Button>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-2">Payload</h3>
              <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto max-h-72">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-2">
                Delivery attempts ({attempts.length})
              </h3>
              <div className="space-y-3">
                {attempts.length === 0 && (
                  <div className="text-xs text-muted-foreground">No attempts yet.</div>
                )}
                {attempts.map((a: any) => {
                  const ok = typeof a.response_status === "number" && a.response_status >= 200 && a.response_status < 300;
                  return (
                    <div key={a.id} className="rounded-md border border-border p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Attempt #{a.attempt_number}</span>
                        <span className="text-muted-foreground">
                          {new Date(a.attempted_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={ok ? "bg-emerald-500/15 text-emerald-700" : "bg-destructive/15 text-destructive"}
                        >
                          {a.response_status ?? "no response"}
                        </Badge>
                        {a.duration_ms != null && (
                          <span className="text-muted-foreground">{a.duration_ms} ms</span>
                        )}
                      </div>
                      {a.error && <div className="text-destructive">{a.error}</div>}
                      {a.response_body && (
                        <pre className="rounded bg-muted p-2 overflow-x-auto max-h-40">
                          {a.response_body}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmDead}
          onOpenChange={setConfirmDead}
          title="Mark this event as dead?"
          description="It will no longer be retried. This action is reversible only by Retry now."
          destructive
          confirmLabel="Mark dead"
          confirmationText="DEAD"
          loading={deadMut.isPending}
          onConfirm={() => deadMut.mutate()}
        />

        <ConfirmDialog
          open={confirmDisable}
          onOpenChange={setConfirmDisable}
          title="Disable this endpoint?"
          description="All pending and future events for this endpoint will fail until re-enabled."
          destructive
          confirmLabel="Disable endpoint"
          confirmationText="DISABLE"
          loading={disableMut.isPending}
          onConfirm={() => e && disableMut.mutate(e.endpointId)}
        />
      </SheetContent>
    </Sheet>
  );
}
