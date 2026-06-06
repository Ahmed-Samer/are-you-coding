import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, keepPreviousData } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { z } from "zod";
import { Activity, Search, Eye, FilterX, Clock, Database, User } from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { listAuditLog } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/admin-utils";

const searchSchema = z.object({
  page: z.number().int().min(1).default(1).catch(1),
  actorId: z.string().uuid().optional().catch(undefined),
  targetTable: z.string().optional().catch(undefined),
});

const auditQuery = (opts: z.infer<typeof searchSchema>) =>
  queryOptions({
    queryKey: ["admin", "audit", opts],
    queryFn: () => listAuditLog({ 
      data: { 
        page: opts.page, 
        pageSize: 50, 
        actorId: opts.actorId, 
        targetTable: opts.targetTable 
      } 
    }),
    placeholderData: keepPreviousData,
  });

export const Route = createFileRoute("/_authenticated/admin/audit")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Admin — Global Audit Log" }] }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(auditQuery(deps)),
  component: AdminAuditPage,
});

function getActionColor(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("create") || lower.includes("insert") || lower.includes("approve") || lower.includes("reactivate")) {
    return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
  }
  if (lower.includes("update") || lower.includes("edit") || lower.includes("toggle") || lower.includes("resolve")) {
    return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
  }
  if (lower.includes("delete") || lower.includes("suspend") || lower.includes("reject") || lower.includes("force_delete")) {
    return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
  }
  return "bg-muted text-muted-foreground border-border";
}

export function AdminAuditPage() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(auditQuery(searchParams));

  const logs = data.entries ?? [];
  const total = data.total ?? 0;

  // Local state for debounced filters
  const [actorIdInput, setActorIdInput] = useState(searchParams.actorId ?? "");
  const [targetTableInput, setTargetTableInput] = useState(searchParams.targetTable ?? "");

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  // Debounce actorId and targetTable inputs
  useEffect(() => {
    const t = setTimeout(() => {
      navigate({
        search: (s) => ({
          ...s,
          actorId: actorIdInput || undefined,
          targetTable: targetTableInput || undefined,
          page: 1, // reset page on filter change
        }),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [actorIdInput, targetTableInput, navigate]);

  const clearFilters = () => {
    setActorIdInput("");
    setTargetTableInput("");
    navigate({ search: () => ({ page: 1 }) });
  };

  const hasFilters = !!searchParams.actorId || !!searchParams.targetTable;

  return (
    <AdminShell
      title="Global Audit Log"
      description="Immutable ledger of all administrative and systemic actions across the platform."
      breadcrumbs={[{ label: "Audit Logs" }]}
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col h-full">
        
        {/* Filters Section */}
        <div className="p-4 border-b border-border bg-muted/10 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <User className="size-3" /> Actor User ID (UUID)
            </label>
            <Input 
              placeholder="e.g. 123e4567-e89b-..." 
              value={actorIdInput}
              onChange={(e) => setActorIdInput(e.target.value)}
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Database className="size-3" /> Target Table
            </label>
            <Input 
              placeholder="e.g. tenants, payment_proofs..." 
              value={targetTableInput}
              onChange={(e) => setTargetTableInput(e.target.value)}
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="flex justify-end md:justify-start">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground h-9">
                <FilterX className="size-4 mr-2" /> Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[180px]">Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actor (User ID)</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${getActionColor(log.action)}`}>
                      {log.action.replace(".", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs font-medium text-foreground">
                      {log.target_table || "—"}
                    </div>
                    {log.target_id && (
                      <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]" title={log.target_id}>
                        {log.target_id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded bg-muted flex items-center justify-center border border-border shrink-0">
                        <User className="size-3 text-muted-foreground" />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={log.actor_id}>
                        {log.actor_id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      <Clock className="size-3" />
                      <span title={new Date(log.created_at).toLocaleString()}>{timeAgo(log.created_at)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs"
                      onClick={() => setSelectedLog(log)}
                      disabled={!log.diff || Object.keys(log.diff).length === 0}
                    >
                      <Eye className="size-4 mr-1.5" /> View Diff
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!logs.length && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Activity className="size-8 opacity-20" />
                      <p className="text-sm">No audit records found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border mt-auto bg-muted/10">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(searchParams.page - 1) * 50 + 1}</span> to <span className="font-medium text-foreground">{Math.min(searchParams.page * 50, total)}</span> of <span className="font-medium text-foreground">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page <= 1}
                onClick={() => navigate({ search: (s) => ({ ...s, page: s.page - 1 }) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page * 50 >= total}
                onClick={() => navigate({ search: (s) => ({ ...s, page: s.page + 1 }) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* JSON Diff Modal */}
      <Dialog open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="size-5 text-primary" /> Audit Record Details
            </DialogTitle>
            <DialogDescription>
              Technical snapshot of the data state captured during this event.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Action Type</span>
                  <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${getActionColor(selectedLog.action)}`}>
                    {selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Timestamp</span>
                  <span className="font-medium">{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Actor ID</span>
                  <span className="font-mono text-xs break-all">{selectedLog.actor_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Target Identity</span>
                  <span className="font-mono text-xs break-all">
                    {selectedLog.target_table} / {selectedLog.target_id || "N/A"}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 text-foreground">Payload / Diff</h4>
                <div className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto border border-border">
                  <pre className="text-[11px] font-mono leading-relaxed">
                    {JSON.stringify(selectedLog.diff, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}