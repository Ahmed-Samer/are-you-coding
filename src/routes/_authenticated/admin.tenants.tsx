import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { 
  Search, Download, MoreVertical, ShieldAlert, 
  CheckCircle, Trash2, ExternalLink, Store 
} from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { 
  listAllTenants, 
  suspendTenant, 
  reactivateTenant, 
  forceDeleteTenant 
} from "@/lib/admin.functions";
import { downloadCsv, timeAgo } from "@/lib/admin-utils";

const searchSchema = z.object({
  status: z.enum(["all", "pending", "active", "suspended"]).default("all").catch("all"),
  q: z.string().optional(),
  page: z.number().int().min(1).default(1).catch(1),
});

const tenantsQuery = (opts: z.infer<typeof searchSchema>) =>
  queryOptions({
    queryKey: ["admin", "tenants", opts],
    queryFn: () => listAllTenants({ 
      data: { 
        // Backend expects undefined for "all"
        status: opts.status === "all" ? undefined : (opts.status as any), 
        search: opts.q, 
        page: opts.page, 
        pageSize: 25 
      } 
    }),
    placeholderData: keepPreviousData,
  });

export const Route = createFileRoute("/_authenticated/admin/tenants")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Admin — Tenants" }] }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(tenantsQuery(deps)),
  component: AdminTenantsPage,
});

const TABS = [
  { key: "all", label: "All Tenants" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "suspended", label: "Suspended" },
] as const;

function statusVariant(s: string) {
  if (s === "active") return "default";
  if (s === "pending") return "secondary";
  if (s === "suspended") return "destructive";
  return "outline";
}

export function AdminTenantsPage() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(tenantsQuery(searchParams));
  const qc = useQueryClient();

  const suspendFn = useServerFn(suspendTenant);
  const reactivateFn = useServerFn(reactivateTenant);
  const forceDeleteFn = useServerFn(forceDeleteTenant);

  const tenants = data.tenants ?? [];
  const total = data.total ?? 0;

  const [localQuery, setLocalQuery] = useState(searchParams.q ?? "");

  // Modal States
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [deleteInput, setDeleteInput] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== searchParams.q) {
        navigate({ search: (s: any) => ({ ...s, q: localQuery || undefined, page: 1 }) });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [localQuery, navigate, searchParams.q]);

  // Mutations
  const reactivateMut = useMutation({
    mutationFn: (tenantId: string) => reactivateFn({ data: { tenantId } }),
    onSuccess: () => {
      toast.success("Tenant reactivated successfully");
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const suspendMut = useMutation({
    mutationFn: () => suspendFn({ data: { tenantId: suspendTarget!.id, reason: suspendReason || undefined } }),
    onSuccess: () => {
      toast.success("Tenant suspended");
      setSuspendTarget(null);
      setSuspendReason("");
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => forceDeleteFn({ data: { tenantId: deleteTarget!.id, confirmSlug: deleteInput } }),
    onSuccess: () => {
      toast.success("Tenant permanently deleted");
      setDeleteTarget(null);
      setDeleteInput("");
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminShell
      title="Tenants Management"
      description="Manage storefronts, monitor their statuses, and enforce platform policies."
      breadcrumbs={[{ label: "Tenants" }]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              "platform-tenants.csv",
              tenants.map((t: any) => ({
                id: t.id,
                name: t.name,
                slug: t.slug,
                niche: t.niche ?? "",
                status: t.status,
                created_at: t.created_at,
              })),
            )
          }
        >
          <Download className="size-4" /> Export CSV
        </Button>
      }
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Filters Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => navigate({ search: (s: any) => ({ ...s, status: t.key, page: 1 }) })}
                className={
                  "px-3 h-7 text-xs rounded inline-flex items-center gap-1.5 transition-colors " +
                  (searchParams.status === t.key 
                    ? "bg-foreground text-background font-medium shadow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or slug..."
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* Data Table */}
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Storefront</TableHead>
              <TableHead>Niche</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t: any) => (
              <TableRow 
                key={t.id} 
                className="group cursor-pointer"
                onClick={() => navigate({ to: `/admin/tenants/${t.id}` })}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-md bg-muted flex items-center justify-center border border-border shrink-0">
                      <Store className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {t.name}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                        /{t.slug}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground capitalize">
                  {t.niche ? t.niche.replace("-", " ") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(t.status)} className="capitalize">
                    {t.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {timeAgo(t.created_at)}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity">
                        <MoreVertical className="size-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => navigate({ to: `/admin/tenants/${t.id}` })}>
                        <ExternalLink className="size-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      {t.status === "suspended" ? (
                        <DropdownMenuItem 
                          onClick={() => reactivateMut.mutate(t.id)}
                          disabled={reactivateMut.isPending}
                        >
                          <CheckCircle className="size-4 mr-2 text-green-500" />
                          Reactivate Store
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem 
                          onClick={() => setSuspendTarget({ id: t.id, name: t.name })}
                          className="text-amber-600 focus:text-amber-600 focus:bg-amber-50 dark:focus:bg-amber-950/50"
                        >
                          <ShieldAlert className="size-4 mr-2" />
                          Suspend Store
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem 
                        onClick={() => setDeleteTarget({ id: t.id, name: t.name, slug: t.slug })}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="size-4 mr-2" />
                        Force Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!tenants.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  <Store className="size-10 mx-auto mb-3 opacity-20" />
                  <p>No tenants found matching your criteria.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        {total > 25 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(searchParams.page - 1) * 25 + 1}</span> to <span className="font-medium text-foreground">{Math.min(searchParams.page * 25, total)}</span> of <span className="font-medium text-foreground">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page <= 1}
                onClick={() => navigate({ search: (s: any) => ({ ...s, page: s.page - 1 }) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={searchParams.page * 25 >= total}
                onClick={() => navigate({ search: (s: any) => ({ ...s, page: s.page + 1 }) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Suspend Modal */}
      <Dialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.name}?</DialogTitle>
            <DialogDescription>
              Suspending a store instantly takes it offline for visitors and locks the dashboard for the owner. 
              Billing subscriptions are NOT automatically paused.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-1.5 block text-foreground">
              Reason for suspension (optional)
            </label>
            <Textarea 
              placeholder="e.g. Terms of service violation, unpaid invoices..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="resize-none"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-2">
              This reason will be logged and may be included in the automated email sent to the owner.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => suspendMut.mutate()} 
              disabled={suspendMut.isPending}
            >
              {suspendMut.isPending ? "Suspending..." : "Confirm Suspension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Delete Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="border-destructive/30">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="size-5" /> 
              Danger: Force Delete Store
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground/80">
              You are about to permanently delete <strong className="text-foreground">{deleteTarget?.name}</strong>. 
              This will destroy all products, orders, categories, and remove the database schema. 
              <br/><br/>
              <span className="text-destructive font-semibold">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 bg-destructive/5 px-4 rounded-md border border-destructive/20 mt-2">
            <label className="text-sm font-medium mb-2 block text-foreground">
              Please type <strong className="font-mono bg-background px-1 py-0.5 rounded border">{deleteTarget?.slug}</strong> to confirm.
            </label>
            <Input 
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={deleteTarget?.slug}
              className="border-destructive/30 focus-visible:ring-destructive"
            />
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteInput(""); }}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteMut.mutate()} 
              disabled={deleteMut.isPending || deleteInput !== deleteTarget?.slug}
            >
              {deleteMut.isPending ? "Deleting..." : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AdminShell>
  );
}