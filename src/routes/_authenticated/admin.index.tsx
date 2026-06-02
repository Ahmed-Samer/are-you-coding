import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, Receipt, TrendingUp, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAdminDashboardKPIs, listAuditLog, listPendingProofs } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/admin-utils";

const kpiQuery = queryOptions({
  queryKey: ["admin", "kpis"],
  queryFn: () => getAdminDashboardKPIs(),
});
const recentAuditQuery = queryOptions({
  queryKey: ["admin", "audit", "recent"],
  queryFn: () => listAuditLog({ data: { page: 1, pageSize: 12 } }),
});
const pendingProofsQuery = queryOptions({
  queryKey: ["admin", "proofs", "all"],
  queryFn: () => listPendingProofs(),
});

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Overview" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(kpiQuery),
      context.queryClient.ensureQueryData(recentAuditQuery),
      context.queryClient.ensureQueryData(pendingProofsQuery),
    ]);
  },
  component: AdminOverview,
});

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

type Proof = {
  id: string;
  status: string;
  amount_usd: number | null;
  created_at: string;
  tenants?: { name: string; slug: string } | null;
  subscriptions?: { plans?: { name: string } | null } | null;
};

function AdminOverview() {
  const { data: kpis } = useSuspenseQuery(kpiQuery);
  const { data: audit } = useSuspenseQuery(recentAuditQuery);
  const { data: proofsData } = useSuspenseQuery(pendingProofsQuery);

  const pending = (proofsData.proofs as Proof[]).filter((p) => p.status === "pending");

  return (
    <AdminShell
      title="Overview"
      description="Real-time pulse of the platform — revenue, tenants, and review queue."
      actions={
        <Button size="sm" asChild>
          <Link to="/admin/payments">Review queue ({kpis.pendingProofs})</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric
          label="MRR"
          value={`$${kpis.mrrUsd.toLocaleString()}`}
          hint={`ARR $${kpis.arrUsd.toLocaleString()}`}
        />
        <Metric
          label="Active tenants"
          value={String(kpis.activeTenants)}
          hint={`${kpis.totalTenants} total`}
        />
        <Metric
          label="Pending proofs"
          value={String(kpis.pendingProofs)}
          hint="awaiting decision"
        />
        <Metric
          label="Active subs"
          value={String(kpis.activeSubscriptions)}
          hint="paid subscriptions"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold">Activity feed</h2>
              <p className="text-xs text-muted-foreground">Recent admin actions and audit events</p>
            </div>
            <Link to="/admin/audit" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              View audit log <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {audit.entries.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet.</li>
            )}
            {audit.entries.map((a: any) => (
              <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                <span
                  className={
                    "size-7 rounded-full grid place-items-center text-[10px] font-semibold " +
                    (a.action?.startsWith("proof")
                      ? "bg-amber-500/10 text-amber-700"
                      : a.action?.startsWith("tenant")
                        ? "bg-blue-500/10 text-blue-600"
                        : a.action?.startsWith("plan")
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-muted text-foreground")
                  }
                >
                  {a.action?.startsWith("proof") ? (
                    <Receipt className="size-3.5" />
                  ) : a.action?.startsWith("tenant") ? (
                    <Building2 className="size-3.5" />
                  ) : a.action?.startsWith("plan") ? (
                    <TrendingUp className="size-3.5" />
                  ) : (
                    <Users className="size-3.5" />
                  )}
                </span>
                <span className="flex-1 text-sm">
                  <code className="font-mono text-xs">{a.action}</code>
                  {a.target_table && (
                    <span className="text-muted-foreground"> · {a.target_table}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Review queue</h2>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <ul className="divide-y divide-border">
            {pending.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-muted-foreground">All clear.</li>
            )}
            {pending.slice(0, 5).map((p) => (
              <li key={p.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.tenants?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.subscriptions?.plans?.name ?? "Plan"} · ${p.amount_usd ?? 0}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {timeAgo(p.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-5 py-3 border-t border-border">
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/admin/payments">Open queue</Link>
            </Button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
