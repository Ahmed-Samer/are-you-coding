import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getErrorReports, resolveErrorReport, deleteErrorReport } from "@/lib/errors.functions";

export type ErrorReportRow = {
  id: string;
  scope: string;
  route: string | null;
  message: string;
  stack: string | null;
  user_id: string | null;
  tenant_id: string | null;
  meta: Record<string, any>;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

export function ErrorsTable() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "resolved" | "unresolved">("unresolved");
  const [scopeFilter, setScopeFilter] = useState<"all" | "frontend" | "backend" | "worker" | "unknown">("all");
  
  const [selectedError, setSelectedError] = useState<ErrorReportRow | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "errors", page, statusFilter, scopeFilter],
    queryFn: () => getErrorReports({ data: { page, pageSize: 20, statusFilter, scopeFilter } }),
  });

  const rows: ErrorReportRow[] = (q.data?.errors as ErrorReportRow[]) ?? [];
  const total = q.data?.total ?? 0;

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolveErrorReport({ data: { id } }),
    onSuccess: () => {
      toast.success("Error marked as resolved.");
      queryClient.invalidateQueries({ queryKey: ["admin", "errors"] });
      setIsDetailsOpen(false);
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteErrorReport({ data: { id } }),
    onSuccess: () => {
      toast.success("Error log deleted.");
      queryClient.invalidateQueries({ queryKey: ["admin", "errors"] });
      setIsDetailsOpen(false);
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const openDetails = (errorRow: ErrorReportRow) => {
    setSelectedError(errorRow);
    setIsDetailsOpen(true);
  };

  const getScopeBadgeVariant = (scope: string) => {
    switch (scope) {
      case "backend": return "destructive";
      case "frontend": return "default";
      case "worker": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Errors Logs</h2>
          <p className="text-xs text-muted-foreground">
            Track, inspect, and resolve application exceptions.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={scopeFilter} onValueChange={(v: any) => { setScopeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              <SelectItem value="frontend">Frontend</SelectItem>
              <SelectItem value="backend">Backend</SelectItem>
              <SelectItem value="worker">Worker</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="unresolved">Unresolved</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Scope</th>
              <th className="text-left px-4 py-2 font-medium">Message & Route</th>
              <th className="text-left px-4 py-2 font-medium">Tenant ID</th>
              <th className="text-left px-4 py-2 font-medium">Date</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading system errors...
                </td>
              </tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No errors found. The system is stable!
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 align-top">
                  <Badge variant={getScopeBadgeVariant(row.scope)} className="capitalize text-[10px]">
                    {row.scope}
                  </Badge>
                </td>
                <td className="px-4 py-3 align-top max-w-[300px]">
                  <div className="font-medium text-destructive truncate" title={row.message}>
                    {row.message}
                  </div>
                  <div className="text-xs text-muted-foreground truncate font-mono mt-1">
                    {row.route || "Unknown Route"}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  {row.tenant_id ? (
                    <span className="text-[10px] font-mono text-muted-foreground" title={row.tenant_id}>
                      {row.tenant_id.substring(0, 8)}...
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Global</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 align-top">
                  {row.resolved ? (
                    <Badge variant="outline" className="text-emerald-500 border-emerald-200 bg-emerald-500/10">
                      Resolved
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">Manage</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openDetails(row)}>
                        View Details & Stack Trace
                      </DropdownMenuItem>
                      {!row.resolved && (
                        <DropdownMenuItem onClick={() => resolveMut.mutate(row.id)}>
                          Mark as Resolved
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this error log?")) {
                            deleteMut.mutate(row.id);
                          }
                        }}
                      >
                        Delete Log
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Badge variant={getScopeBadgeVariant(selectedError?.scope || "unknown")}>{selectedError?.scope}</Badge>
              Error Details
            </DialogTitle>
            <DialogDescription>
              Occurred at {selectedError ? new Date(selectedError.created_at).toLocaleString() : ''}
            </DialogDescription>
          </DialogHeader>
          
          {selectedError && (
            <div className="space-y-4 mt-2">
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Message</h4>
                <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm font-medium">
                  {selectedError.message}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Route / Context</h4>
                  <div className="bg-muted p-2 rounded-md text-xs font-mono">
                    {selectedError.route || "N/A"}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Tenant ID</h4>
                  <div className="bg-muted p-2 rounded-md text-xs font-mono">
                    {selectedError.tenant_id || "Global / N/A"}
                  </div>
                </div>
              </div>

              {selectedError.stack && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Stack Trace</h4>
                  <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-md text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedError.stack}
                  </pre>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-border mt-6">
                {!selectedError.resolved && (
                  <Button variant="default" onClick={() => resolveMut.mutate(selectedError.id)} disabled={resolveMut.isPending}>
                    Mark as Resolved
                  </Button>
                )}
                <Button variant="destructive" onClick={() => { if (window.confirm("Are you sure?")) deleteMut.mutate(selectedError.id); }} disabled={deleteMut.isPending}>
                  Delete Log
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}