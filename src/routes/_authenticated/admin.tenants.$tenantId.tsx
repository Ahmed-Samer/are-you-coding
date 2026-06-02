import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Eye, Pause, Play } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { getTenantDetail, suspendTenant, reactivateTenant } from "@/lib/admin.functions";
import { listBillingAdjustments } from "@/lib/billing-admin.functions";
import { timeAgo } from "@/lib/admin-utils";

// Billing panels are heavy (charts, tables, mutation forms) and admin-only.
// Lazy chunk loads when the user actually opens the Billing tab.
const BillingTab = lazy(() => import("@/components/admin/billing/BillingTab"));

type TenantStatus = "pending" | "active" | "suspended";

function detailQuery(tenantId: string) {
  return queryOptions({
    queryKey: ["admin", "tenant", tenantId],
    queryFn: () => getTenantDetail({ data: { tenantId } }),
  });
}

export const Route = createFileRoute("/_authenticated/admin/tenants/$tenantId")({
  head: ({ params }) => ({ meta: [{ title: `Admin — Tenant ${params.tenantId}` }] }),
  notFoundComponent: () => (
    <AdminShell title="Tenant not found" breadcrumbs={[{ label: "Tenants", to: "/admin/tenants" }]}>
      <div className="text-sm text-muted-foreground">No tenant with that id.</div>
    </AdminShell>
  ),
  errorComponent: ({ error }) => (
    <AdminShell title="Couldn't load tenant" breadcrumbs={[{ label: "Tenants", to: "/admin/tenants" }]}>
      <div className="text-sm text-destructive">{error.message}</div>
    </AdminShell>
  ),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(detailQuery(params.tenantId));
    } catch (e) {
      if (e instanceof Error && /Not found/i.test(e.message)) throw notFound();
      throw e;
    }
  },
  component: TenantDetailPage,
});

function statusVariant(s: TenantStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "active") return "default";
  if (s === "pending") return "secondary";
  if (s === "suspended") return "destructive";
  return "outline";
}

function TenantDetailPage() {
  const { tenantId } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(tenantId));
  const qc = useQueryClient();
  const suspendFn = useServerFn(suspendTenant);
  const reactivateFn = useServerFn(reactivateTenant);

  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const suspend = useMutation({
    mutationFn: () => suspendFn({ data: { tenantId } }),
    onSuccess: () => {
      toast.success("Tenant suspended");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reactivate = useMutation({
    mutationFn: () => reactivateFn({ data: { tenantId } }),
    onSuccess: () => {
      toast.success("Tenant reactivated");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Credit balance for the billing panels — also primes the ledger cache.
  const creditQ = useQuery({
    queryKey: ["admin", "billing", tenantId, "summary"],
    queryFn: () =>
      listBillingAdjustments({ data: { tenantId, page: 1, pageSize: 1 } }),
  });

  const tenant = data.tenant as any;
  const subs = (data.subscriptions ?? []) as any[];
  const proofs = (data.proofs ?? []) as any[];
  const audits = (data.audit ?? []) as any[];
  const status = (tenant.status ?? "pending") as TenantStatus;
  const activeSub =
    subs.find((s) => s.status === "active") ?? subs[0] ?? null;

  return (
    <AdminShell
      title={tenant.name}
      description={tenant.slug}
      breadcrumbs={[
        { label: "Tenants", to: "/admin/tenants" },
        { label: tenant.name },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <a href={`/?store=${tenant.slug}`} target="_blank" rel="noreferrer">
              <Eye className="size-4" /> Preview storefront
            </a>
          </Button>
          {status === "suspended" ? (
            <Button size="sm" disabled={reactivate.isPending} onClick={() => reactivate.mutate()}>
              <Play className="size-4" /> Unsuspend
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmSuspend(true)}>
              <Pause className="size-4" /> Suspend
            </Button>
          )}
        </>
      }
    >
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold mb-4">Account</h2>
                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={statusVariant(status)} className="capitalize">{status}</Badge>
                  </dd>
                  <dt className="text-muted-foreground">Niche</dt>
                  <dd className="capitalize">{tenant.niche ?? "—"}</dd>
                  <dt className="text-muted-foreground">Owner ID</dt>
                  <dd className="font-mono text-xs">{tenant.owner_id}</dd>
                  <dt className="text-muted-foreground">Slug</dt>
                  <dd className="font-mono text-xs">/{tenant.slug}</dd>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{new Date(tenant.created_at).toLocaleDateString()} · {timeAgo(tenant.created_at)}</dd>
                </dl>
              </div>

              <div className="rounded-xl border border-border bg-card">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold">Subscription history</h2>
                </div>
                <ul className="divide-y divide-border text-sm">
                  {subs.length === 0 && (
                    <li className="px-5 py-6 text-muted-foreground text-center">No subscriptions yet.</li>
                  )}
                  {subs.map((s) => (
                    <li key={s.id} className="px-5 py-3 flex items-center justify-between">
                      <span>
                        {s.plans?.name ?? "—"}
                        <span className="text-muted-foreground text-xs ml-2">{s.plans?.interval}</span>
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {s.status} · {timeAgo(s.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold">Recent payment proofs</h2>
                </div>
                <ul className="divide-y divide-border">
                  {proofs.length ? (
                    proofs.map((p) => (
                      <li key={p.id} className="px-5 py-3 flex items-center justify-between text-sm">
                        <div>
                          <div>${p.amount_usd ?? 0}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.reference_number ?? "—"}</div>
                        </div>
                        <Badge
                          variant={p.status === "approved" ? "default" : p.status === "pending" ? "secondary" : "outline"}
                          className="capitalize"
                        >
                          {p.status}
                        </Badge>
                      </li>
                    ))
                  ) : (
                    <li className="px-5 py-6 text-sm text-muted-foreground text-center">No proofs yet.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold mb-1">Open storefront</h2>
                <p className="text-xs text-muted-foreground mb-3">View the live storefront as the public would see it.</p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={`/?store=${tenant.slug}`} target="_blank" rel="noreferrer">
                    Open <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <BillingTab
              tenantId={tenantId}
              activeSub={activeSub}
              proofs={proofs}
              creditBalanceUsd={creditQ.data?.creditBalanceUsd ?? 0}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Audit log</h2>
              <p className="text-xs text-muted-foreground">Latest actions targeting this tenant.</p>
            </div>
            <ul className="divide-y divide-border text-sm">
              {audits.length === 0 && (
                <li className="px-5 py-6 text-muted-foreground text-center">No audit entries yet.</li>
              )}
              {audits.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    actor: {a.actor_id}
                  </div>
                  {a.diff && (
                    <pre className="mt-2 text-[11px] bg-muted/40 rounded p-2 overflow-x-auto">
                      {JSON.stringify(a.diff, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title={`Suspend ${tenant.name}?`}
        description="The storefront will go offline and the owner cannot use the dashboard until reactivated."
        confirmLabel="Suspend tenant"
        destructive
        confirmationText="SUSPEND"
        onConfirm={() => {
          suspend.mutate();
          setConfirmSuspend(false);
        }}
      />
    </AdminShell>
  );
}
