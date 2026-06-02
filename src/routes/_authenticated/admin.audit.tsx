import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAuditLog, listFeatureFlags } from "@/lib/admin.functions";
import { downloadCsv } from "@/lib/admin-utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const auditQuery = queryOptions({
  queryKey: ["admin", "audit"],
  queryFn: () => listAuditLog({ data: { page: 1, pageSize: 100 } }),
});

const flagsQuery = queryOptions({
  queryKey: ["admin", "flags"],
  queryFn: () => listFeatureFlags(),
});

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Admin — Audit log" }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(auditQuery),
      context.queryClient.ensureQueryData(flagsQuery),
    ]),
  component: AuditPage,
});

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  diff: unknown;
  ip_address: string | null;
  created_at: string;
};

function AuditPage() {
  const { data } = useSuspenseQuery(auditQuery);
  const { data: flagsData } = useSuspenseQuery(flagsQuery);
  const exportEnabled = ((flagsData.flags ?? []) as Array<{ key: string; enabled: boolean }>)
    .some((f) => f.key === "admin_audit_export" && f.enabled);
  const entries = (data.entries ?? []) as AuditRow[];
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return entries;
    return entries.filter((a) =>
      [a.actor_id, a.action, a.target_table, a.target_id, a.ip_address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [q, entries]);

  return (
    <AdminShell
      title="Audit log"
      description="Every reviewer action and admin change, with actor, target, IP and timestamp."
      breadcrumbs={[{ label: "Audit log" }]}
      actions={
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={exportEnabled ? -1 : 0}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!exportEnabled}
                  onClick={() =>
                    downloadCsv(
                      "audit-log.csv",
                      rows.map((r) => ({
                        actor: r.actor_id ?? "system",
                        role: r.actor_role,
                        action: r.action,
                        target: `${r.target_table ?? ""}/${r.target_id ?? ""}`,
                        ip: r.ip_address,
                        created_at: r.created_at,
                      })),
                    )
                  }
                >
                  <Download className="size-4" /> Export
                </Button>
              </span>
            </TooltipTrigger>
            {!exportEnabled && (
              <TooltipContent>Enable the <code>admin_audit_export</code> flag to use.</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      }
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Filter by actor, action, target…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4">Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="text-right pr-4">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="pl-4 font-medium text-xs font-mono">
                  {a.actor_id?.slice(0, 8) ?? "system"}
                </TableCell>
                <TableCell><code className="text-xs font-mono">{a.action}</code></TableCell>
                <TableCell className="text-sm">
                  {a.target_table ? (
                    <span>
                      {a.target_table}
                      {a.target_id && <span className="text-muted-foreground font-mono"> · {a.target_id.slice(0, 8)}</span>}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{a.ip_address ?? "—"}</TableCell>
                <TableCell className="text-right pr-4 text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                  No matching entries.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
