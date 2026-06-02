import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listWebhookEvents } from "@/lib/webhooks-admin.functions";
import { WebhookEventDrawer } from "./WebhookEventDrawer";

type Status = "pending" | "in_flight" | "succeeded" | "failed" | "dead";
const ALL_STATUSES: Status[] = ["pending", "in_flight", "succeeded", "failed", "dead"];

const STATUS_TONE: Record<Status, string> = {
  pending: "bg-muted text-foreground",
  in_flight: "bg-blue-500/15 text-blue-700",
  succeeded: "bg-emerald-500/15 text-emerald-700",
  failed: "bg-amber-500/15 text-amber-700",
  dead: "bg-destructive/15 text-destructive",
};

function shortUrl(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function WebhookEventsTable() {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [eventType, setEventType] = useState("");
  const [endpointSearch, setEndpointSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "webhooks", "events", statuses, eventType, endpointSearch, page],
    queryFn: () =>
      listWebhookEvents({
        data: {
          status: statuses.length ? statuses : undefined,
          eventType: eventType || undefined,
          endpointSearch: endpointSearch || undefined,
          page,
          pageSize: 25,
        },
      }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  function toggle(s: Status) {
    setPage(1);
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {ALL_STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statuses.includes(s) ? "default" : "outline"}
              onClick={() => toggle(s)}
              className="capitalize"
            >
              {s.replace("_", " ")}
            </Button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Event type (e.g. order.created)"
            value={eventType}
            onChange={(e) => {
              setPage(1);
              setEventType(e.target.value);
            }}
            className="sm:max-w-xs"
          />
          <Input
            placeholder="Endpoint URL contains…"
            value={endpointSearch}
            onChange={(e) => {
              setPage(1);
              setEndpointSearch(e.target.value);
            }}
            className="sm:max-w-xs"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Created</th>
              <th className="text-left px-4 py-2 font-medium">Tenant</th>
              <th className="text-left px-4 py-2 font-medium">Event</th>
              <th className="text-left px-4 py-2 font-medium">Endpoint</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Attempts</th>
              <th className="text-left px-4 py-2 font-medium">Last error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No webhook events match these filters.
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr
                key={r.id}
                className="hover:bg-muted/40 cursor-pointer"
                onClick={() => setOpenEventId(r.id)}
              >
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 max-w-[180px] truncate">{r.tenantName ?? r.tenantId}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.eventType}</td>
                <td className="px-4 py-2 text-xs">{shortUrl(r.endpointUrl)}</td>
                <td className="px-4 py-2">
                  <Badge variant="outline" className={STATUS_TONE[r.status as Status]}>
                    {r.status.replace("_", " ")}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.attemptCount}/6</td>
                <td className="px-4 py-2 max-w-[320px] truncate text-xs text-muted-foreground">
                  {r.lastError ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total} event{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </span>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <WebhookEventDrawer
        eventId={openEventId}
        onOpenChange={(open) => !open && setOpenEventId(null)}
        onChanged={() => q.refetch()}
      />
    </div>
  );
}
