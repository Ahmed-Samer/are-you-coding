import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useState } from "react";
import { Download, Search, UserCog } from "lucide-react";
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
import { listAllTenants } from "@/lib/admin.functions";
import { startImpersonation } from "@/lib/impersonation.functions";
import { downloadCsv, timeAgo } from "@/lib/admin-utils";
import { toast } from "@/lib/toast";

type TenantStatus = "pending" | "active" | "suspended";
type Tenant = {
  id: string;
  slug: string;
  name: string;
  niche: string | null;
  status: TenantStatus;
  created_at: string;
  owner_id: string;
};

const STATUSES: (TenantStatus | "all")[] = ["all", "pending", "active", "suspended"];
const PAGE_SIZE = 25;

function tenantsQuery(input: { status?: TenantStatus; search?: string; page: number }) {
  return queryOptions({
    queryKey: ["admin", "tenants", input],
    queryFn: () =>
      listAllTenants({
        data: {
          status: input.status,
          search: input.search,
          page: input.page,
          pageSize: PAGE_SIZE,
        },
      }),
  });
}

export const Route = createFileRoute("/_authenticated/admin/tenants")({
  head: () => ({ meta: [{ title: "Admin — Tenants" }] }),
  component: AdminTenantsPage,
});

function statusVariant(s: TenantStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "active") return "default";
  if (s === "pending") return "secondary";
  if (s === "suspended") return "destructive";
  return "outline";
}

type TenantRowProps = {
  tenant: Tenant;
  isPending: boolean;
  onImpersonate: (id: string, name: string) => void;
};

const TenantRow = memo(function TenantRow({ tenant: t, isPending, onImpersonate }: TenantRowProps) {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Link
          to="/admin/tenants/$tenantId"
          params={{ tenantId: t.id }}
          className="font-medium hover:underline"
        >
          {t.name}
        </Link>
        <div className="text-xs text-muted-foreground font-mono">/{t.slug}</div>
      </TableCell>
      <TableCell className="text-sm capitalize">{t.niche ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={statusVariant(t.status)} className="capitalize">
          {t.status}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{timeAgo(t.created_at)}</TableCell>
      <TableCell className="text-right pr-4">
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={isPending}
          onClick={() => onImpersonate(t.id, t.name)}
        >
          <UserCog className="size-3.5 mr-1" />
          {isPending ? "Entering…" : "Impersonate"}
        </Button>
      </TableCell>
    </TableRow>
  );
});

function AdminTenantsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [page, setPage] = useState(1);
  const startFn = useServerFn(startImpersonation);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const impersonateMut = useMutation({
    mutationFn: (tenantId: string) => startFn({ data: { tenantId } }),
    onMutate: (tenantId) => setPendingId(tenantId),
    onSettled: () => setPendingId(null),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["impersonation-state"] });
      toast.success(`Now viewing ${res.tenantName} (read-only)`);
      navigate({
        to: "/store/$slug/overview",
        params: { slug: res.tenantSlug },
      });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to start impersonation";
      toast.error(msg);
    },
  });

  const handleImpersonate = useCallback(
    (id: string, name: string) => {
      if (!window.confirm(`Enter read-only impersonation of ${name}?`)) return;
      impersonateMut.mutate(id);
    },
    [impersonateMut],
  );

  const { data } = useSuspenseQuery(
    tenantsQuery({
      status: status === "all" ? undefined : status,
      search: query.trim() || undefined,
      page,
    }),
  );
  const tenants = (data.tenants ?? []) as Tenant[];
  const total = data.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell
      title="Tenants"
      description="All stores on the platform — owners, plans, status, and activity."
      breadcrumbs={[{ label: "Tenants" }]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              "tenants.csv",
              tenants.map((t) => ({
                name: t.name,
                slug: t.slug,
                niche: t.niche,
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
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-border">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or slug…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                className={
                  "px-2.5 h-7 text-xs rounded capitalize transition-colors " +
                  (status === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4">Tenant</TableHead>
              <TableHead>Niche</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TenantRow
                key={t.id}
                tenant={t}
                isPending={impersonateMut.isPending && pendingId === t.id}
                onImpersonate={handleImpersonate}
              />
            ))}
            {!tenants.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                  No tenants match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
          <span>Showing {tenants.length} of {total}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="px-2 tabular-nums">{page} / {pageCount}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
