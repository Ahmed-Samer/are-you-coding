import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check, Copy, Globe, AlertTriangle, Clock, RefreshCw, Plus, Trash2,
  Star, ShieldCheck, ExternalLink, Lock, Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store-context";
import {
  listMyDomains,
  addDomain,
  removeDomain,
  triggerDomainVerification,
  setPrimaryDomain,
} from "@/lib/domains.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/store/$slug/domains")({
  head: () => ({ meta: [{ title: "Domains — Store admin" }] }),
  component: DomainsTab,
});

// ---- platform constants -------------------------------------------------
const PLATFORM_ROOT = "rentwebify.app";
const PLATFORM_CNAME_TARGET = "edge.rentwebify.app";
const PLATFORM_A_RECORDS = ["76.76.21.21", "76.76.21.22"];
const RESERVED = new Set([
  "rentwebify.app", "www.rentwebify.app", "rentwebify.com", "lovable.app",
  "lovable.dev", "localhost",
]);
const PLAN_INCLUDES_CUSTOM_DOMAINS = true;

// ---- types --------------------------------------------------------------
type DnsRecordStatus = "pending" | "verified" | "mismatch";
type SslStatus = "pending" | "issued" | "failed";
type DomainStatus = "pending" | "verified" | "error";
type ActivityKind = "added" | "verified" | "disconnected" | "rechecked" | "primary";

interface DnsRecord {
  type: "CNAME" | "A" | "TXT";
  host: string;
  value: string;
  status: DnsRecordStatus;
}
interface CustomDomain {
  id: string;
  host: string;
  status: DomainStatus;
  ssl: SslStatus;
  isPrimary: boolean;
  forceHttps: boolean;
  redirectPreference: "www-to-apex" | "apex-to-www";
  addedAt: number;
  lastCheckedAt: number | null;
  records: DnsRecord[];
  verificationToken: string;
  activity: { kind: ActivityKind; at: number; note?: string }[];
}

interface ServerDomainRow {
  id: string;
  host: string;
  kind: string;
  status: string;
  verification_token: string | null;
  verified_at: string | null;
  created_at: string;
}

// RFC-1035 hostname validation (basic).
function validateHostname(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (!v) return "Domain is required";
  if (/\s/.test(v)) return "Domain cannot contain spaces";
  if (/^https?:\/\//.test(v)) return "Don't include http:// or https://";
  if (v.includes("/")) return "Don't include paths or slashes";
  if (v.length > 253) return "Domain too long";
  if (!v.includes(".")) return "Use a full domain (e.g. shop.brand.com)";
  const labelRe = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const label of v.split(".")) {
    if (!labelRe.test(label)) return `Invalid segment "${label}"`;
  }
  if (RESERVED.has(v)) return "This domain is reserved by the platform";
  return null;
}

function isApex(host: string) {
  return host.split(".").length === 2;
}
function buildRecords(host: string, token: string, verified: boolean): DnsRecord[] {
  const apex = isApex(host);
  const status: DnsRecordStatus = verified ? "verified" : "pending";
  return [
    apex
      ? { type: "A", host: "@", value: PLATFORM_A_RECORDS.join(", "), status }
      : { type: "CNAME", host: host.split(".")[0]!, value: PLATFORM_CNAME_TARGET, status },
    { type: "TXT", host: `_rentwebify-verify.${host}`, value: token, status },
  ];
}

// Map server status → UI status.
function mapStatus(s: string): DomainStatus {
  if (s === "verified") return "verified";
  if (s === "failed") return "error";
  return "pending";
}

function toCustomDomain(row: ServerDomainRow, primaryId: string | null): CustomDomain {
  const status = mapStatus(row.status);
  const token = row.verification_token ?? "";
  const addedAt = new Date(row.created_at).getTime();
  const lastCheckedAt = row.verified_at ? new Date(row.verified_at).getTime() : null;
  const activity: CustomDomain["activity"] = [{ kind: "added", at: addedAt }];
  if (status === "verified" && lastCheckedAt) {
    activity.push({ kind: "verified", at: lastCheckedAt });
  }
  return {
    id: row.id,
    host: row.host,
    status,
    ssl: status === "verified" ? "issued" : status === "error" ? "failed" : "pending",
    isPrimary: primaryId === row.id,
    forceHttps: true,
    redirectPreference: "www-to-apex",
    addedAt,
    lastCheckedAt,
    records: buildRecords(row.host, token, status === "verified"),
    verificationToken: token,
    activity,
  };
}

// ---- main component -----------------------------------------------------
export function DomainsTab() {
  const { tenant } = useStore();
  const subdomain = `${tenant.slug}.${PLATFORM_ROOT}`;
  const [showUpgrade, setShowUpgrade] = useState(false);
  // Primary is not persisted on the schema yet (server emits an audit row).
  // Track locally so the UI is responsive; default to first verified domain.
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  const qc = useQueryClient();
  const fetchList = useServerFn(listMyDomains);
  const fnAdd = useServerFn(addDomain);
  const fnRemove = useServerFn(removeDomain);
  const fnVerify = useServerFn(triggerDomainVerification);
  const fnPrimary = useServerFn(setPrimaryDomain);

  const queryKey = ["domains", tenant.id] as const;
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchList({ data: { tenantId: tenant.id } }),
  });

  const domains = useMemo<CustomDomain[]>(() => {
    const rows: ServerDomainRow[] = (data?.domains ?? []) as ServerDomainRow[];
    return rows
      .filter((r) => r.kind !== "subdomain")
      .map((r) => toCustomDomain(r, primaryId));
  }, [data, primaryId]);

  // Default-select primary once data lands.
  useEffect(() => {
    if (primaryId) return;
    const firstVerified = domains.find((d) => d.status === "verified");
    if (firstVerified) setPrimaryId(firstVerified.id);
  }, [domains, primaryId]);

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const addMut = useMutation({
    mutationFn: (host: string) => fnAdd({ data: { tenantId: tenant.id, host } }),
    onSuccess: (_res, host) => {
      toast.success(`${host} added — follow DNS instructions to verify`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add domain"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => fnRemove({ data: { tenantId: tenant.id, id } }),
    onSuccess: (_res, id) => {
      const host = domains.find((d) => d.id === id)?.host ?? "Domain";
      toast.success(`${host} disconnected`);
      if (primaryId === id) setPrimaryId(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove domain"),
  });
  const verifyMut = useMutation({
    mutationFn: (id: string) => fnVerify({ data: { tenantId: tenant.id, id } }),
    onSuccess: (res: any) => {
      if (res?.success) toast.success("Domain verified");
      else toast.info("Still pending — DNS can take a few minutes");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Verification failed"),
  });
  const primaryMut = useMutation({
    mutationFn: (id: string) => fnPrimary({ data: { tenantId: tenant.id, id } }),
    onSuccess: (_res, id) => {
      setPrimaryId(id);
      toast.success("Primary domain updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not set primary"),
  });

  return (
    <div className="space-y-8">
      <SubdomainCard subdomain={subdomain} />

      {!PLAN_INCLUDES_CUSTOM_DOMAINS && (
        <UpsellBanner onUpgrade={() => setShowUpgrade(true)} />
      )}

      <AddDomainSection
        disabled={!PLAN_INCLUDES_CUSTOM_DOMAINS || addMut.isPending}
        existing={domains.map((d) => d.host)}
        onAdd={(host) => addMut.mutate(host)}
      />

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Loading domains…
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn't load your domains. Refresh to try again.
        </div>
      ) : domains.length === 0 ? (
        <EmptyState />
      ) : (
        <DomainsList
          domains={domains}
          verifyingId={verifyMut.isPending ? (verifyMut.variables as string | undefined) : undefined}
          onVerify={(id) => verifyMut.mutate(id)}
          onRemove={(id) => removeMut.mutate(id)}
          onMakePrimary={(id) => primaryMut.mutate(id)}
        />
      )}

      <UpgradeDialog open={showUpgrade} onOpenChange={setShowUpgrade} />
    </div>
  );
}

// ---- subdomain ----------------------------------------------------------
function SubdomainCard({ subdomain }: { subdomain: string }) {
  return (
    <section className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Free subdomain</p>
          <div className="mt-1 flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" />
            <span className="font-mono text-sm">{subdomain}</span>
            <Badge variant="secondary" className="ml-1">Always on</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            This URL always works. You can add a custom domain below.
          </p>
        </div>
        <a
          href={`https://${subdomain}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent"
        >
          Visit <ExternalLink className="size-3.5" />
        </a>
      </div>
    </section>
  );
}

// ---- upsell -------------------------------------------------------------
function UpsellBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        <Sparkles className="size-4 mt-0.5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Custom domains are a Pro feature</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect your own domain like shop.brand.com and use it across email and shares.
          </p>
        </div>
      </div>
      <Button size="sm" onClick={onUpgrade}>Upgrade plan</Button>
    </div>
  );
}

function UpgradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to Pro</DialogTitle>
          <DialogDescription>
            Custom domains are included on the Pro plan along with priority verification and managed SSL.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-sm space-y-2 mt-2">
          {["Unlimited custom domains", "Managed SSL certificates", "WWW ↔ apex redirects", "Priority DNS checks"].map((f) => (
            <li key={f} className="flex items-center gap-2"><Check className="size-4 text-foreground" /> {f}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Maybe later</Button>
          <Button onClick={() => { onOpenChange(false); toast.success("Redirecting to billing…"); }}>
            Continue to billing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- add domain ---------------------------------------------------------
function AddDomainSection({
  disabled, existing, onAdd,
}: { disabled: boolean; existing: string[]; onAdd: (host: string) => void }) {
  const [host, setHost] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const normalized = host.trim().toLowerCase();
  const error = useMemo(() => {
    if (!touched && !host) return null;
    const e = validateHostname(host);
    if (e) return e;
    if (existing.includes(normalized)) return "Domain already added";
    return null;
  }, [host, touched, existing, normalized]);

  return (
    <section className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold">Add custom domain</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect a domain you own. You'll add DNS records in the next step.
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (disabled) return;
          const err = validateHostname(host);
          if (err || existing.includes(normalized)) return;
          setConfirmOpen(true);
        }}
        className="flex flex-col sm:flex-row gap-2 sm:items-start"
      >
        <div className="flex-1">
          <Label htmlFor="domain-input" className="sr-only">Domain</Label>
          <Input
            id="domain-input"
            placeholder="shop.brand.com"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            aria-invalid={!!error}
            aria-describedby={error ? "domain-error" : "domain-hint"}
            className="font-mono"
          />
          {error ? (
            <p id="domain-error" className="mt-1.5 text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="size-3" /> {error}
            </p>
          ) : (
            <p id="domain-hint" className="mt-1.5 text-xs text-muted-foreground">
              Use a subdomain (shop.brand.com) or apex (brand.com). No https://, no paths.
            </p>
          )}
        </div>
        <Button type="submit" disabled={disabled || !!error || !host.trim()} className="gap-1.5">
          <Plus className="size-4" /> Add domain
        </Button>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {normalized}?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll generate DNS instructions you can add at your domain registrar. The domain
              becomes live once DNS propagates and SSL is issued.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onAdd(normalized); setConfirmOpen(false); setHost(""); setTouched(false); }}
            >
              Add domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ---- domains list -------------------------------------------------------
function DomainsList({
  domains, verifyingId, onVerify, onRemove, onMakePrimary,
}: {
  domains: CustomDomain[];
  verifyingId: string | undefined;
  onVerify: (id: string) => void;
  onRemove: (id: string) => void;
  onMakePrimary: (id: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Connected domains</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{domains.length} total</span>
      </div>
      {domains.map((d) => (
        <DomainCard
          key={d.id}
          domain={d}
          isVerifying={verifyingId === d.id}
          onVerify={() => onVerify(d.id)}
          onRemove={() => onRemove(d.id)}
          onMakePrimary={() => onMakePrimary(d.id)}
        />
      ))}
    </section>
  );
}

// ---- domain card --------------------------------------------------------
function DomainCard({
  domain, isVerifying, onVerify, onRemove, onMakePrimary,
}: {
  domain: CustomDomain;
  isVerifying: boolean;
  onVerify: () => void;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  // Local-only UI prefs (no schema yet for force-https / redirect preference).
  const [forceHttps, setForceHttps] = useState(domain.forceHttps);
  const [redirect, setRedirect] = useState(domain.redirectPreference);

  return (
    <article className="rounded-lg border border-border overflow-hidden">
      <div className="p-5 flex items-start justify-between gap-3 flex-wrap border-b border-border bg-muted/30">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Globe className="size-4 text-muted-foreground" />
            <span className="font-mono text-sm font-medium">{domain.host}</span>
            {domain.isPrimary && (
              <Badge variant="secondary" className="gap-1"><Star className="size-3" />Primary</Badge>
            )}
            <DomainStatusPill status={domain.status} />
            <SslPill status={domain.ssl} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Added {fmtRelative(domain.addedAt)}
            {domain.lastCheckedAt && <> · Last checked {fmtRelative(domain.lastCheckedAt)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!domain.isPrimary && domain.status === "verified" && (
            <Button size="sm" variant="outline" onClick={onMakePrimary} className="gap-1.5">
              <Star className="size-3.5" /> Make primary
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onVerify} disabled={isVerifying} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${isVerifying ? "animate-spin" : ""}`} />
            {isVerifying ? "Checking…" : "Verify now"}
          </Button>
          <RemoveDomainButton host={domain.host} onRemove={onRemove} />
        </div>
      </div>

      {domain.status === "verified" ? (
        <VerifiedBody
          domain={domain}
          forceHttps={forceHttps}
          onForceHttpsChange={setForceHttps}
          redirectPreference={redirect}
          onRedirectChange={setRedirect}
        />
      ) : (
        <PendingBody domain={domain} />
      )}

      <ActivityLog activity={domain.activity} />
    </article>
  );
}

// ---- pending body -------------------------------------------------------
function PendingBody({ domain }: { domain: CustomDomain }) {
  return (
    <div className="p-5 space-y-5">
      {domain.status === "error" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-destructive">DNS mismatch detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              One or more records don't point to our servers. Double-check the values below and
              remove any conflicting records (especially older A or AAAA records on the same host).
            </p>
          </div>
        </div>
      )}

      <CnameVisualizer domain={domain.host} />

      <div>
        <h3 className="text-sm font-semibold mb-2">Add these DNS records</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Sign in to your DNS provider and add each record below. DNS changes usually take a few
          minutes to propagate.
        </p>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="hidden sm:grid grid-cols-[80px_1fr_1fr_120px_44px] gap-3 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
            <span>Type</span><span>Host</span><span>Value</span><span>Status</span><span className="sr-only">Copy</span>
          </div>
          {domain.records.map((r, i) => (
            <DnsRow key={i} record={r} />
          ))}
        </div>
      </div>

      <ProviderGuides />
    </div>
  );
}

function DnsRow({ record }: { record: DnsRecord }) {
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Couldn't copy"),
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr_1fr_120px_44px] gap-2 sm:gap-3 px-4 py-3 border-b border-border last:border-b-0 text-sm">
      <div className="font-mono text-xs"><Badge variant="outline">{record.type}</Badge></div>
      <div className="font-mono text-xs break-all"><span className="sm:hidden text-muted-foreground">Host: </span>{record.host}</div>
      <div className="font-mono text-xs break-all"><span className="sm:hidden text-muted-foreground">Value: </span>{record.value}</div>
      <div><RecordStatusPill status={record.status} /></div>
      <div className="flex sm:justify-end">
        <Button size="icon" variant="ghost" aria-label={`Copy ${record.type} value`} onClick={() => copy(record.value)}>
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function CnameVisualizer({ domain }: { domain: string }) {
  const apex = isApex(domain);
  return (
    <div className="rounded-md border border-border p-4 bg-muted/20">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">How it connects</p>
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs">
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono">
          <Globe className="size-3.5" />{domain}
        </div>
        <span className="text-muted-foreground font-mono">{apex ? "A →" : "CNAME →"}</span>
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono">
          {apex ? PLATFORM_A_RECORDS[0] : PLATFORM_CNAME_TARGET}
        </div>
        <span className="text-muted-foreground font-mono">→</span>
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5">
          <ShieldCheck className="size-3.5" /> RentWebify edge
        </div>
      </div>
    </div>
  );
}

function ProviderGuides() {
  const guides: Record<string, string[]> = {
    Cloudflare: [
      "Open Cloudflare → DNS → Records.",
      "Click Add record, pick the type from the table above.",
      "Set Proxy status to DNS only (gray cloud) for the first verification.",
      "Save and return here to verify.",
    ],
    GoDaddy: [
      "Open GoDaddy → My Products → DNS for the domain.",
      "Add records with the exact Type, Host and Value above.",
      "Set TTL to 600s (or default).",
      "Wait a few minutes, then click Verify now.",
    ],
    Namecheap: [
      "Open Namecheap → Domain List → Manage → Advanced DNS.",
      "Add a new record with the type, host (use @ for apex) and value.",
      "Remove any older A records pointing to other servers.",
      "Return here and verify.",
    ],
    Route53: [
      "Open Route 53 → Hosted zones → your domain.",
      "Create record using the values above. Use ALIAS for apex if available.",
      "TTL 300s is fine.",
      "Return here and click Verify now.",
    ],
  };
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Provider quick guides</h3>
      <Tabs defaultValue="Cloudflare">
        <TabsList>
          {Object.keys(guides).map((name) => (
            <TabsTrigger key={name} value={name}>{name}</TabsTrigger>
          ))}
        </TabsList>
        {Object.entries(guides).map(([name, steps]) => (
          <TabsContent key={name} value={name} className="mt-3">
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
              {steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ---- verified body ------------------------------------------------------
function VerifiedBody({
  domain, forceHttps, onForceHttpsChange, redirectPreference, onRedirectChange,
}: {
  domain: CustomDomain;
  forceHttps: boolean;
  onForceHttpsChange: (v: boolean) => void;
  redirectPreference: CustomDomain["redirectPreference"];
  onRedirectChange: (v: CustomDomain["redirectPreference"]) => void;
}) {
  return (
    <div className="p-5 space-y-5">
      <div className="rounded-md border border-border bg-muted/30 p-4 flex items-start gap-3">
        <div className="size-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
          <Check className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Your domain is live</p>
          <a
            href={`https://${domain.host}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-0.5"
          >
            https://{domain.host} <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor={`https-${domain.id}`} className="text-sm">Force HTTPS redirect</Label>
            <Switch
              id={`https-${domain.id}`}
              checked={forceHttps}
              onCheckedChange={onForceHttpsChange}
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="size-3" /> Always serve traffic over HTTPS.
          </p>
        </div>
        <div className="rounded-md border border-border p-4">
          <Label className="text-sm mb-2 block">Redirect preference</Label>
          <RadioGroup
            value={redirectPreference}
            onValueChange={(v) => onRedirectChange(v as CustomDomain["redirectPreference"])}
            className="space-y-1"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="www-to-apex" id={`a-${domain.id}`} />
              <span>www → apex (canonical: {domain.host.replace(/^www\./, "")})</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="apex-to-www" id={`b-${domain.id}`} />
              <span>apex → www</span>
            </label>
          </RadioGroup>
        </div>
      </div>
    </div>
  );
}

// ---- empty state --------------------------------------------------------
function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <div className="mx-auto size-10 rounded-full bg-muted flex items-center justify-center mb-3">
        <Globe className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">No custom domain yet</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
        Use your own domain (like shop.brand.com) for a more professional storefront, branded
        share links, and consistent customer trust.
      </p>
    </div>
  );
}

// ---- remove domain ------------------------------------------------------
function RemoveDomainButton({ host, onRemove }: { host: string; onRemove: () => void }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");

  function close() { setStage(0); setConfirmText(""); }

  return (
    <>
      <Button size="icon" variant="ghost" aria-label={`Remove ${host}`} onClick={() => setStage(1)}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog
        open={stage === 1}
        onOpenChange={(o) => {
          if (o) return;
          setStage((s) => (s === 1 ? 0 : s));
          setConfirmText((t) => (stage === 1 ? "" : t));
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {host}?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers visiting this domain will stop reaching your store. You can reconnect later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setStage(2)}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={stage === 2} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Final confirmation</DialogTitle>
            <DialogDescription>
              Type <span className="font-mono font-medium text-foreground">{host}</span> to disconnect.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={host}
            className="font-mono"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== host}
              onClick={() => { onRemove(); close(); }}
            >
              Disconnect domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- activity log -------------------------------------------------------
function ActivityLog({ activity }: { activity: CustomDomain["activity"] }) {
  const sorted = [...activity].sort((a, b) => b.at - a.at).slice(0, 5);
  return (
    <details className="border-t border-border group">
      <summary className="px-5 py-3 text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1.5">
        <Clock className="size-3" />
        Activity log
        <span className="ml-auto tabular-nums">{activity.length} events</span>
      </summary>
      <ol className="px-5 pb-4 space-y-1.5 text-xs">
        {sorted.map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-muted-foreground/60" />
              <span className="capitalize">{e.kind}</span>
              {e.note && <span className="text-muted-foreground/70">— {e.note}</span>}
            </span>
            <span className="tabular-nums">{fmtRelative(e.at)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

// ---- status pills -------------------------------------------------------
function DomainStatusPill({ status }: { status: DomainStatus }) {
  if (status === "verified") return <Badge variant="default" className="gap-1"><Check className="size-3" />Verified</Badge>;
  if (status === "error") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />Needs attention</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="size-3" />Pending</Badge>;
}
function SslPill({ status }: { status: SslStatus }) {
  if (status === "issued") return <Badge variant="outline" className="gap-1"><Lock className="size-3" />SSL issued</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />SSL failed</Badge>;
  return <Badge variant="outline" className="gap-1 text-muted-foreground"><Lock className="size-3" />SSL pending</Badge>;
}
function RecordStatusPill({ status }: { status: DnsRecordStatus }) {
  if (status === "verified") return <Badge variant="default" className="gap-1"><Check className="size-3" />Verified</Badge>;
  if (status === "mismatch") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />Mismatch</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="size-3" />Pending</Badge>;
}

// ---- helpers ------------------------------------------------------------
function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}
