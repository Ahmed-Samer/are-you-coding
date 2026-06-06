import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { 
  ArrowLeft, Store, ShieldAlert, CheckCircle, 
  Clock, CreditCard, History, User, Globe, AlertTriangle,
  FileText, Activity
} from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getTenantDetail, suspendTenant, reactivateTenant } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/admin-utils";
import { getStorefrontUrl } from "@/lib/branding";

const tenantDetailQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["admin", "tenants", "detail", tenantId],
    queryFn: () => getTenantDetail({ data: { tenantId } }),
  });

export const Route = createFileRoute("/_authenticated/admin/tenants/$tenantId")({
  parseParams: (params) => ({ tenantId: params.tenantId }),
  head: () => ({ meta: [{ title: "Admin — Tenant Details" }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(tenantDetailQuery(params.tenantId)),
  component: TenantDetailPage,
});

function statusVariant(s: string) {
  if (s === "active") return "default";
  if (s === "pending") return "secondary";
  if (s === "suspended") return "destructive";
  return "outline";
}

export function TenantDetailPage() {
  const { tenantId } = Route.useParams();
  const { data } = useSuspenseQuery(tenantDetailQuery(tenantId));
  const qc = useQueryClient();

  const suspendFn = useServerFn(suspendTenant);
  const reactivateFn = useServerFn(reactivateTenant);

  const tenant = data.tenant;
  const subscriptions = data.subscriptions ?? [];
  const proofs = data.proofs ?? [];
  const auditLogs = data.audit ?? [];

  // Modal States
  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  // Mutations
  const reactivateMut = useMutation({
    mutationFn: () => reactivateFn({ data: { tenantId } }),
    onSuccess: () => {
      toast.success("Store has been successfully reactivated");
      qc.invalidateQueries({ queryKey: ["admin", "tenants", "detail", tenantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const suspendMut = useMutation({
    mutationFn: () => suspendFn({ data: { tenantId, reason: suspendReason || undefined } }),
    onSuccess: () => {
      toast.success("Store has been suspended");
      setIsSuspendOpen(false);
      setSuspendReason("");
      qc.invalidateQueries({ queryKey: ["admin", "tenants", "detail", tenantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!tenant) {
    return (
      <AdminShell title="Error" description="Tenant not found" breadcrumbs={[{ label: "Tenants", to: "/admin/tenants" }, { label: "Not Found" }]}>
        <div className="p-6 text-center text-muted-foreground">The requested tenant could not be found.</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={tenant.name}
      description={`Manage and audit storefront details for /${tenant.slug}`}
      breadcrumbs={[
        { label: "Tenants", to: "/admin/tenants" },
        { label: tenant.name }
      ]}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/tenants">
            <ArrowLeft className="size-4 mr-2" /> Back to List
          </Link>
        </Button>
      }
    >
      {/* Top Banner Status Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-4 border-b border-border bg-muted/10">
            <div className="size-12 rounded-lg bg-muted flex items-center justify-center border border-border">
              <Store className="size-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                {tenant.name}
                <Badge variant={statusVariant(tenant.status)} className="capitalize">
                  {tenant.status}
                </Badge>
              </CardTitle>
              <CardDescription className="font-mono text-xs mt-0.5">ID: {tenant.id}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-sm">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Globe className="size-4 text-foreground/70" />
              <span>Slug URL: </span>
              <strong className="text-foreground font-mono">/{tenant.slug}</strong>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <User className="size-4 text-foreground/70" />
              <span>Owner Reference: </span>
              <strong className="text-foreground font-mono text-xs">{tenant.owner_id || "—"}</strong>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Clock className="size-4 text-foreground/70" />
              <span>Created On: </span>
              <strong className="text-foreground">{new Date(tenant.created_at).toLocaleString()}</strong>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Store className="size-4 text-foreground/70" />
              <span>Business Niche: </span>
              <strong className="text-foreground capitalize">{tenant.niche ? tenant.niche.replace("-", " ") : "—"}</strong>
            </div>
          </CardContent>
        </Card>

        {/* Quick Operations Policy Enforcement */}
        <Card className="shadow-sm border-border flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Policy Enforcement</CardTitle>
            <CardDescription>Instant administrative overrides for this tenant environment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pb-6 flex-1 flex flex-col justify-end">
            {tenant.status === "suspended" ? (
              <Button 
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-sm"
                onClick={() => reactivateMut.mutate()}
                disabled={reactivateMut.isPending}
              >
                <CheckCircle className="size-4 mr-2" /> Reactivate Storefront
              </Button>
            ) : (
              <Button 
                variant="destructive" 
                className="w-full shadow-sm"
                onClick={() => setIsSuspendOpen(true)}
              >
                <ShieldAlert className="size-4 mr-2" /> Suspend Storefront
              </Button>
            )}
            <Button variant="outline" className="w-full" asChild>
              <a
                href={getStorefrontUrl(tenant.slug)}
                target="_blank"
                rel="noreferrer"
              >
                Visit Storefront <ArrowLeft className="size-4 ml-2 rotate-180" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Detail Analysis Tabs */}
      <Tabs defaultValue="billing" className="space-y-4">
        <TabsList className="border border-border p-1 bg-muted/30">
          <TabsTrigger value="billing" className="inline-flex items-center gap-2">
            <CreditCard className="size-4" /> Subscription & Billing
          </TabsTrigger>
          <TabsTrigger value="proofs" className="inline-flex items-center gap-2">
            <FileText className="size-4" /> Payment Receipts ({proofs.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="inline-flex items-center gap-2">
            <Activity className="size-4" /> Security Audit Log ({auditLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Billing & Subscriptions */}
        <TabsContent value="billing" className="space-y-4">
          <Card className="shadow-sm border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <History className="size-4 text-muted-foreground" /> Subscription Cycles History
              </CardTitle>
              <CardDescription>Comprehensive ledger of all subscription packages requested or applied to this tenant site.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Plan Package</TableHead>
                    <TableHead>Pricing Model</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Period End Date</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-semibold text-foreground">
                        {sub.plans?.name ?? "Custom Package Plan"}
                      </TableCell>
                      <TableCell className="tabular-nums font-mono text-sm">
                        {sub.plans?.price_usd ? `$${sub.plans.price_usd}` : "Free tier"}
                      </TableCell>
                      <TableCell className="capitalize text-xs text-muted-foreground">
                        {sub.plans?.interval ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sub.status === "active" ? "default" : "secondary"} className="capitalize">
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {sub.period_end ? new Date(sub.period_end).toLocaleDateString() : "Lifetime / Infinite"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(sub.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!subscriptions.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                        No historical subscription data associated with this storefront profile.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Manual Payment Proofs */}
        <TabsContent value="proofs" className="space-y-4">
          <Card className="shadow-sm border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" /> Manual Ledger Proof Receipts
              </CardTitle>
              <CardDescription>Audited cash transfers, digital wallet statements, and InstaPay snapshot records.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Reference ID</TableHead>
                    <TableHead className="text-right">Amount (USD)</TableHead>
                    <TableHead className="text-right">Amount (EGP)</TableHead>
                    <TableHead>Review Status</TableHead>
                    <TableHead className="text-right">Submitted Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proofs.map((proof: any) => (
                    <TableRow key={proof.id}>
                      <TableCell className="font-mono text-xs font-semibold">{proof.reference_number || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">${proof.amount_usd ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{(proof.amount_egp ?? 0).toLocaleString()} EGP</TableCell>
                      <TableCell>
                        <Badge variant={proof.status === "approved" ? "default" : proof.status === "pending" ? "secondary" : "destructive"} className="capitalize">
                          {proof.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(proof.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {!proofs.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                        No payment upload receipts recorded from this domain merchant.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Security Audit Log */}
        <TabsContent value="audit" className="space-y-4">
          <Card className="shadow-sm border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="size-4 text-muted-foreground" /> Traceability System Audit Log
              </CardTitle>
              <CardDescription>Immutable environmental telemetry tracking administrative shifts and status changes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-border pl-4 ml-2 space-y-4 py-2">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="relative group">
                    {/* Timeline Node Dot */}
                    <div className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border border-card bg-primary group-hover:scale-125 transition-transform" />
                    <div className="bg-muted/40 rounded-lg p-3 border border-border text-xs shadow-sm">
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <span className="font-semibold text-primary font-mono capitalize">{log.action}</span>
                        <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-muted-foreground font-mono text-[11px] mt-0.5">Actor User ID: {log.actor_id}</div>
                      {log.diff && Object.keys(log.diff).length > 0 && (
                        <pre className="mt-2 text-[10px] font-mono bg-background border border-border p-2 rounded max-h-32 overflow-y-auto text-foreground/80">
                          {JSON.stringify(log.diff, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
                {!auditLogs.length && (
                  <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                    No sequential system modifications or log events logged for this database profile record.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Administrative Suspension Dialogue Prompt Modal */}
      <Dialog open={isSuspendOpen} onOpenChange={(o) => !o && setIsSuspendOpen(null as any)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" /> Enforcement Block: Suspend Storefront
            </DialogTitle>
            <DialogDescription>
              Confirming this operational parameter will securely switch the application route parameters to a frozen state. 
              The target storefront domain environment will render an inactive placeholder block page immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-1.5 block text-foreground">
              Administrative Reason for Operational Suspension
            </label>
            <Textarea 
              placeholder="Input system enforcement reasons (e.g., terms of agreement non-compliance, financial invoicing dispute)..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="resize-none border-border"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuspendOpen(false)}>Cancel Action</Button>
            <Button 
              variant="destructive" 
              onClick={() => suspendMut.mutate()} 
              disabled={suspendMut.isPending}
            >
              {suspendMut.isPending ? "Applying Block..." : "Confirm Suspension Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}