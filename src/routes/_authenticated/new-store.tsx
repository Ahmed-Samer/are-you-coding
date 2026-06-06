import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Store,
  XCircle,
  AlertCircle,
  Monitor,
  Shirt,
  Sparkles
} from "lucide-react";
import { TEMPLATES as TEMPLATE_REGISTRY, isTemplateSelectable, getAvailableTemplates } from "@/lib/templates";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { createTenant, getMyAccountSubscription } from "@/lib/billing.functions";
import { checkSlugAvailability, type SlugAvailabilityReason } from "@/lib/onboarding.functions";
import { SLUG_MAX, SLUG_REGEX, slugify, validateSlug } from "@/lib/slug-rules";
import { STORE_DOMAIN_SUFFIX, formatStoreAddress } from "@/lib/branding";

export const Route = createFileRoute("/_authenticated/new-store")({
  head: () => ({ meta: [{ title: "Deploy your platform — RentWebify" }] }),
  // C6 fix: server-side guard so a user without an active subscription
  // never sees the wizard UI. We delegate to the same server fn the
  // component uses; the guard is best-effort (network errors fall through
  // to the in-component check). The `createTenant` server fn remains the
  // authoritative server-side check (returns NO_ACTIVE_SUBSCRIPTION).
  beforeLoad: async () => {
    try {
      const res = await getMyAccountSubscription();
      const status = res?.subscription?.status as string | null | undefined;
      if (status !== "active") {
        throw redirect({ to: "/dashboard" });
      }
    } catch (err) {
      // If it's already a redirect, propagate it. Otherwise let the in-component
      // check handle it (e.g. network blip during navigation).
      if (err && typeof err === "object" && "headers" in (err as any)) {
        throw err;
      }
    }
  },
  component: NewStorePage,
});

type StepId = "basics" | "template" | "confirm";
const STEPS = [
  { id: "basics", label: "Store basics" },
  { id: "template", label: "Template" },
  { id: "confirm", label: "Deploy" },
] as const;

const NICHES = [
  { id: "retail", label: "General Retail", icon: Store, available: true },
  { id: "fashion", label: "Fashion & Apparel", icon: Shirt, available: true },
  { id: "electronics", label: "Electronics & Tech", icon: Monitor, available: true },
  { id: "beauty", label: "Health & Beauty", icon: Sparkles, available: true },
];

const TEMPLATES = TEMPLATE_REGISTRY.map((t) => ({
  id: t.slug,
  name: t.name,
  description: t.description,
  audience: t.audience,
  available: t.available,
  comingSoonNote: t.comingSoonNote,
  previewImage: t.previewImage,
  previewImageAlt: t.previewImageAlt,
}));

const FIRST_AVAILABLE_TEMPLATE = getAvailableTemplates()[0]?.slug ?? TEMPLATES[0]?.id ?? "classic";

type SlugStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "reserved" }
  | { kind: "format" }
  | { kind: "rate_limited" }
  | { kind: "error" };

function generateIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  const rnd = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${rnd()}${rnd()}-${rnd()}-4${rnd().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rnd().slice(1)}-${rnd()}${rnd()}${rnd()}`;
}

export function NewStorePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const accountSubFn = useServerFn(getMyAccountSubscription);
  const { data: accountSubData, isLoading: accountSubLoading } = useQuery({
    queryKey: ["my-account-subscription"],
    queryFn: () => accountSubFn(),
    staleTime: 2 * 60_000,
  });

  const accountSub = accountSubData?.subscription;
  const accountSubStatus = (accountSub?.status ?? null) as string | null;
  const hasActiveSubscription = accountSubStatus === "active";
  const quota = accountSubData?.quota ?? { maxStores: 0, hasCustomDomain: false, canCreateMore: false };
  const currentStoreCount = accountSubData?.currentStoreCount ?? 0;

  const createTenantFn = useServerFn(createTenant);
  const checkSlug = useServerFn(checkSlugAvailability);

  const [step, setStep] = useState<StepId>("basics");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [niche, setNiche] = useState("retail");
  const [template, setTemplate] = useState<string>(FIRST_AVAILABLE_TEMPLATE);
  const [idempotencyKey] = useState(() => generateIdempotencyKey());

  const [templateError, setTemplateError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ kind: "idle" });
  const availabilityCache = useRef<Map<string, SlugAvailabilityReason>>(new Map());
  const checkSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
  }, [name, slugTouched]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!slug) {
      setSlugStatus({ kind: "idle" });
      return;
    }
    const local = validateSlug(slug);
    if (!local.ok) {
      setSlugStatus({ kind: local.reason });
      return;
    }
    const cached = availabilityCache.current.get(slug);
    if (cached) {
      setSlugStatus(reasonToStatus(cached));
      return;
    }
    setSlugStatus({ kind: "checking" });
    const seq = ++checkSeq.current;
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await checkSlug({ data: { slug } });
        if (seq !== checkSeq.current) return;
        availabilityCache.current.set(slug, res.reason);
        setSlugStatus(reasonToStatus(res.reason));
      } catch (err) {
        if (seq !== checkSeq.current) return;
        console.error("[new-store] slug check failed", err);
        setSlugStatus({ kind: "error" });
      }
    }, 350);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [slug, checkSlug]);

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  const setStepIdx = (idx: number) => {
    const s = STEPS[Math.max(0, Math.min(STEPS.length - 1, idx))].id as StepId;
    if (s === "confirm" && !isTemplateSelectable(template)) {
      toast.error("Please choose an available template.");
      setStep("template");
      return;
    }
    setStep(s);
  };
  const next = () => setStepIdx(stepIdx + 1);
  const back = () => setStepIdx(stepIdx - 1);

  const slugRuleOk = SLUG_REGEX.test(slug) && validateSlug(slug).ok;
  const slugBlocks =
    slugStatus.kind === "taken" ||
    slugStatus.kind === "reserved" ||
    slugStatus.kind === "format" ||
    slugStatus.kind === "rate_limited" ||
    slugStatus.kind === "checking";

  const canContinueBasics = name.trim().length >= 2 && slugRuleOk && !slugBlocks;
  const canContinueTemplate = isTemplateSelectable(template);

  const onCreate = async () => {
    if (busy) return;
    if (!canContinueBasics) {
      toast.error("Complete the previous steps first.");
      return;
    }
    if (!isTemplateSelectable(template)) {
      setTemplateError("That template is no longer available.");
      toast.error("Please choose an available template.");
      setStep("template");
      return;
    }
    setBusy(true);
    setTemplateError(null);
    try {
      await createTenantFn({
        data: {
          name: name.trim(),
          slug,
          niche,
          template: template as any,
          idempotencyKey,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["my-tenants-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["my-account-subscription"] }),
      ]);
      toast.success("Store created successfully!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      let parsed: any = { code: "UNKNOWN", message: raw };
      try {
        parsed = JSON.parse(raw);
      } catch {}

      const msg = parsed.message || raw;
      if (parsed.code === "SLUG_TAKEN") {
        availabilityCache.current.set(slug, "taken");
        setSlugStatus({ kind: "taken" });
        setStep("basics");
      } else if (parsed.code === "STORE_QUOTA_EXCEEDED") {
        toast.error("You've reached your store limit. Upgrade your plan to create more.");
        navigate({ to: "/dashboard" });
        return;
      } else if (parsed.code === "NO_ACTIVE_SUBSCRIPTION") {
        toast.error("You need an active subscription first.");
        navigate({ to: "/dashboard" });
        return;
      } else if (parsed.code === "TEMPLATE_NOT_AVAILABLE") {
        setTemplateError(msg);
        setStep("template");
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // In-component fallback guard — protects against the rare case where the
  // beforeLoad check didn't run (race with stale cache, role downgrade
  // mid-session, etc.). The beforeLoad is the primary gate.
  if (accountSubLoading) {
    return (
      <PlatformShell>
        <div className="mx-auto max-w-3xl px-6 py-20 flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your account…</p>
        </div>
      </PlatformShell>
    );
  }

  if (!hasActiveSubscription || !quota.canCreateMore) {
    return (
      <PlatformShell>
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <div className="size-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
            <AlertCircle className="size-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold">
            {!hasActiveSubscription ? "No Active Subscription" : "Store limit reached"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            {!hasActiveSubscription
              ? "You need an active subscription to create a new store. Please subscribe to a plan."
              : `You're using all ${quota.maxStores} store${quota.maxStores !== 1 ? "s" : ""} allowed by your plan. Upgrade to create more storefronts.`}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link to="/dashboard">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          </div>
        </div>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create a new store</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-foreground font-medium">{currentStoreCount}/{quota.maxStores}</span> stores used · Quick setup — just name your store and pick a template.
            </p>
          </div>
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" disabled={busy}>Cancel</Button>
          </Link>
        </div>

        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-3">
          <div className="size-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0">
            <Check className="size-4 text-white" />
          </div>
          <div className="text-sm">
            <span className="font-medium text-emerald-800 dark:text-emerald-300">
              Active subscription
            </span>
            <span className="text-emerald-700/80 dark:text-emerald-400/80 ml-1">
              — Your {(accountSub as any)?.plans?.name ?? ""} plan allows up to {quota.maxStores} stores.
              No payment needed for this store.
            </span>
          </div>
        </div>

        <div className="mb-8">
          <Stepper steps={STEPS as any} current={step} />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          {step === "basics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Platform specifics</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Name your platform and pick a web address.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Platform name</Label>
                <Input
                  id="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Store"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Platform address</Label>
                <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    className="border-0 focus-visible:ring-0"
                    placeholder="my-store"
                    maxLength={SLUG_MAX}
                    aria-describedby="slug-status"
                    aria-invalid={
                      slugStatus.kind === "taken" ||
                      slugStatus.kind === "reserved" ||
                      slugStatus.kind === "format"
                    }
                  />
                  <span className="pr-3 text-sm text-muted-foreground whitespace-nowrap">
                    {STORE_DOMAIN_SUFFIX}
                  </span>
                </div>
                <SlugStatusLine slug={slug} status={slugStatus} />
              </div>
              <div className="space-y-2">
                <Label>Primary Industry</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {NICHES.map((n) => {
                    const Icon = n.icon;
                    const selected = niche === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        disabled={!n.available}
                        aria-disabled={!n.available}
                        title={!n.available ? "Available next release" : undefined}
                        onClick={() => setNiche(n.id)}
                        className={
                          "flex flex-col items-center gap-2 rounded-md border p-4 text-sm transition-colors " +
                          (!n.available
                            ? "border-border opacity-50 cursor-not-allowed"
                            : selected
                              ? "border-foreground bg-accent"
                              : "border-border hover:bg-accent/50")
                        }
                      >
                        <Icon className="size-5" />
                        <span className="font-medium text-center">{n.label}</span>
                        {!n.available && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Soon
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === "template" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Choose an architecture</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start from a polished design. You can customize later.
                </p>
              </div>
              <div
                className="grid sm:grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Storefront template"
              >
                {TEMPLATES.map((t) => {
                  const selected = template === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!t.available}
                      onClick={() => t.available && setTemplate(t.id)}
                      className={
                        "relative text-left rounded-md border p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (!t.available
                          ? "border-border opacity-60 cursor-not-allowed"
                          : selected
                            ? "border-foreground bg-accent"
                            : "border-border hover:bg-accent/50")
                      }
                    >
                      <div className="aspect-video rounded-md bg-muted mb-3 overflow-hidden flex items-center justify-center">
                        {t.previewImage ? (
                          <img
                            src={t.previewImage}
                            alt={t.previewImageAlt ?? `${t.name} template preview`}
                            width={640}
                            height={360}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Store className="size-8 text-muted-foreground/60" aria-hidden />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{t.name}</span>
                        {!t.available && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <Lock className="size-3" /> Soon
                          </span>
                        )}
                        {selected && t.available && <Check className="size-4 text-foreground" aria-hidden />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground/80">
                        {t.audience}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Confirm and deploy</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your store will be created instantly using your active subscription.
                </p>
              </div>
              {templateError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground" role="alert">
                  {templateError}
                </div>
              )}
              <dl className="divide-y divide-border rounded-md border border-border">
                {[
                  { k: "Platform name", v: name, stepId: "basics" as StepId },
                  { k: "Address", v: formatStoreAddress(slug), stepId: "basics" as StepId },
                  {
                    k: "Industry",
                    v: NICHES.find((n) => n.id === niche)?.label ?? niche,
                    stepId: "basics" as StepId,
                  },
                  {
                    k: "Architecture",
                    v: TEMPLATES.find((t) => t.id === template)?.name ?? template,
                    stepId: "template" as StepId,
                  },
                ].map(({ k, v, stepId }) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <div className="flex items-center gap-3">
                      <dd className="font-medium text-foreground text-right">{v}</dd>
                      <button
                        type="button"
                        onClick={() => !busy && setStep(stepId)}
                        disabled={busy}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={back} disabled={stepIdx === 0}>
              <ArrowLeft className="size-4 mr-1" /> Back
            </Button>
            {step === "confirm" ? (
              <Button onClick={onCreate} disabled={busy || !canContinueBasics}>
                {busy ? "Deploying…" : "Create store"}
              </Button>
            ) : (
              <Button
                onClick={next}
                disabled={
                  (step === "basics" && !canContinueBasics) ||
                  (step === "template" && !canContinueTemplate)
                }
              >
                Continue <ArrowRight className="size-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}

function reasonToStatus(reason: SlugAvailabilityReason): SlugStatus {
  switch (reason) {
    case "available": return { kind: "available" };
    case "taken": return { kind: "taken" };
    case "reserved": return { kind: "reserved" };
    case "format": return { kind: "format" };
    case "rate_limited": return { kind: "rate_limited" };
    case "error":
    default: return { kind: "error" };
  }
}

function SlugStatusLine({ slug, status }: { slug: string; status: SlugStatus }) {
  if (!slug) {
    return (
      <p id="slug-status" className="text-xs text-muted-foreground" aria-live="polite">
        Your platform will live at <span className="font-mono">your-name{STORE_DOMAIN_SUFFIX}</span>
      </p>
    );
  }
  const address = <span className="font-mono text-foreground">{slug}{STORE_DOMAIN_SUFFIX}</span>;

  switch (status.kind) {
    case "checking":
      return (
        <p id="slug-status" className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3 animate-spin" /> Checking availability for {address}…
        </p>
      );
    case "available":
      return (
        <p id="slug-status" className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400" aria-live="polite">
          <Check className="size-3" /> {address} is available.
        </p>
      );
    case "taken":
      return (
        <p id="slug-status" className="flex items-center gap-1.5 text-xs text-destructive" aria-live="polite">
          <XCircle className="size-3" /> {address} is already taken. Try another address.
        </p>
      );
    case "reserved":
      return (
        <p id="slug-status" className="flex items-center gap-1.5 text-xs text-destructive" aria-live="polite">
          <XCircle className="size-3" /> That address is reserved. Try another address.
        </p>
      );
    case "format":
      return (
        <p id="slug-status" className="text-xs text-destructive" aria-live="polite">
          Lowercase letters, numbers, and hyphens. 3–32 characters, no leading or trailing hyphen.
        </p>
      );
    case "rate_limited":
      return (
        <p id="slug-status" className="text-xs text-muted-foreground" aria-live="polite">
          Too many checks — pausing a moment. We'll re-verify on continue.
        </p>
      );
    case "error":
      return (
        <p id="slug-status" className="text-xs text-muted-foreground" aria-live="polite">
          Couldn't verify availability right now — we'll re-check when you continue.
        </p>
      );
    case "idle":
    default:
      return (
        <p id="slug-status" className="text-xs text-muted-foreground" aria-live="polite">
          Your platform will live at {address}
        </p>
      );
  }
}
