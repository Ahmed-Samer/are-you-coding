import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Store,
  ShoppingBag,
  Scissors,
  Pill,
  Coffee,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { TEMPLATES as TEMPLATE_REGISTRY, isTemplateSelectable, getAvailableTemplates } from "@/lib/templates";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/ui/stepper";
import { listPlans, createTenantAndSubscription } from "@/lib/billing.functions";
import { checkSlugAvailability, type SlugAvailabilityReason } from "@/lib/onboarding.functions";
import { SLUG_MAX, SLUG_REGEX, slugify, validateSlug } from "@/lib/slug-rules";
import { formatPlanPrice, intervalLabel } from "@/lib/format-price";
import { quarterlySavingsPct } from "@/lib/pricing-static";
import { STORE_DOMAIN_SUFFIX, formatStoreAddress } from "@/lib/branding";

const search = z.object({
  plan: z.string().max(64).optional(),
  template: z.string().max(64).optional(),
});

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up your store — CoreWeb" }] }),
  validateSearch: search,
  component: OnboardingPage,
});

type StepId = "basics" | "template" | "plan" | "confirm";
const STEPS = [
  { id: "basics", label: "Store basics" },
  { id: "template", label: "Template" },
  { id: "plan", label: "Plan" },
  { id: "confirm", label: "Confirm" },
] as const;

const NICHES = [
  { id: "retail", label: "Retail", icon: ShoppingBag, available: true },
  { id: "pharmacy", label: "Pharmacy", icon: Pill, available: false },
  { id: "salon", label: "Salon", icon: Scissors, available: false },
  { id: "cafe", label: "Café", icon: Coffee, available: false },
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

const FIRST_AVAILABLE_TEMPLATE =
  getAvailableTemplates()[0]?.slug ?? TEMPLATES[0]?.id ?? "atelier";

// Versioned key — bumping invalidates legacy/corrupt drafts safely.
// v4 introduces a per-draft idempotencyKey so retries don't double-create
// a tenant/subscription.
const DRAFT_KEY = "coreweb:onboarding:draft:v4";

const stepIdEnum = z.enum(["basics", "template", "plan", "confirm"]);
const intervalEnum = z.enum(["monthly", "quarterly"]);

const draftSchema = z.object({
  step: stepIdEnum,
  name: z.string().max(160).default(""),
  slug: z.string().max(64).default(""),
  niche: z.string().max(32).default("retail"),
  template: z.string().max(64).default(""),
  planSlug: z.string().max(64).default(""),
  interval: intervalEnum.default("monthly"),
  idempotencyKey: z.string().uuid().optional(),
  submittedSubscriptionId: z.string().uuid().optional(),
});

type Draft = z.infer<typeof draftSchema>;

type SlugStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "reserved" }
  | { kind: "format" }
  | { kind: "rate_limited" }
  | { kind: "error" };

function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch {}
    return null;
  }
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { plan: prefilledPlan, template: prefilledTemplate } = useSearch({
    from: "/_authenticated/onboarding",
  });

  const fetchPlans = useServerFn(listPlans);
  const {
    data: plansData,
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
    isFetching: plansFetching,
  } = useQuery({
    queryKey: ["plans"],
    queryFn: () => fetchPlans(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const create = useServerFn(createTenantAndSubscription);
  const checkSlug = useServerFn(checkSlugAvailability);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft>(() => {
    // Precedence: restored draft > inbound ?template= (if available) > first available template.
    const restored = readDraft();
    if (restored) {
      if (!isTemplateSelectable(restored.template)) {
        restored.template = FIRST_AVAILABLE_TEMPLATE;
      }
      if (!restored.idempotencyKey) {
        restored.idempotencyKey = generateIdempotencyKey();
      }
      return restored;
    }
    const validInbound = prefilledTemplate && isTemplateSelectable(prefilledTemplate)
      ? prefilledTemplate
      : undefined;
    return {
      step: "basics",
      name: "",
      slug: "",
      niche: "retail",
      template: validInbound ?? FIRST_AVAILABLE_TEMPLATE,
      planSlug: prefilledPlan ?? "",
      interval: "monthly",
      idempotencyKey: generateIdempotencyKey(),
    };
  });
  const [planError, setPlanError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(!!draft.slug);
  const [busy, setBusy] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>(() =>
    draft.slug ? mapValidation(draft.slug) : { kind: "idle" },
  );

  // -- Debounced draft persistence ------------------------------------------
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDraft = useCallback((d: Draft) => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {}
  }, []);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => flushDraft(draft), 400);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [draft, flushDraft]);

  // Auto-slug from name until user edits it
  useEffect(() => {
    if (!slugTouched) setDraft((d) => ({ ...d, slug: slugify(d.name) }));
  }, [draft.name, slugTouched]);

  // Deep-link from the Marketing Pricing page: `?plan=growth-monthly`.
  // Resolution waits for plans to load so we can also align `interval` to the
  // plan row and (when basics are already complete) jump straight to the plan
  // step.
  const deepLinkResolved = useRef(false);
  useEffect(() => {
    if (deepLinkResolved.current) return;
    if (!prefilledPlan) {
      deepLinkResolved.current = true;
      return;
    }
    if (!plansData) return; // wait for plans
    const match = (plansData.plans as Array<{ slug: string; interval: string }>).find(
      (p) => p.slug === prefilledPlan,
    );
    deepLinkResolved.current = true;
    if (!match) {
      console.warn("[onboarding] ?plan= deep link did not match an active plan", prefilledPlan);
      return;
    }
    const matchInterval: "monthly" | "quarterly" =
      match.interval === "quarterly" ? "quarterly" : "monthly";
    setDraft((d) => {
      const basicsReady =
        d.name.trim().length >= 2 && SLUG_REGEX.test(d.slug) && validateSlug(d.slug).ok;
      return {
        ...d,
        planSlug: match.slug,
        interval: matchInterval,
        step: basicsReady && d.step === "basics" ? "plan" : d.step,
      };
    });
  }, [prefilledPlan, plansData]);

  useEffect(() => {
    if (!prefilledTemplate) return;
    if (isTemplateSelectable(prefilledTemplate) && draft.template !== prefilledTemplate) {
      setDraft((d) => ({ ...d, template: prefilledTemplate }));
    }
  }, [prefilledTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback if a restored draft references a template that has since become
  // unavailable / been removed from the registry.
  const staleNoticeShown = useRef(false);
  useEffect(() => {
    if (isTemplateSelectable(draft.template)) return;
    if (staleNoticeShown.current) return;
    staleNoticeShown.current = true;
    const fallback = FIRST_AVAILABLE_TEMPLATE;
    const fallbackName = TEMPLATES.find((t) => t.id === fallback)?.name ?? fallback;
    setDraft((d) => ({ ...d, template: fallback }));
    toast.info(`Previously selected template is no longer available — defaulted to ${fallbackName}.`);
  }, [draft.template]);

  const plans = (plansData?.plans ?? []) as Array<{
    slug: string;
    name: string;
    description: string | null;
    price_usd: number;
    currency: string;
    interval: string;
    features: string[] | null;
  }>;
  const filteredPlans = useMemo(
    () => plans.filter((p) => p.interval === draft.interval),
    [plans, draft.interval],
  );
  const selectedPlan = plans.find((p) => p.slug === draft.planSlug);
  // Derived: only "valid for current interval" plan counts toward Continue.
  // Avoids a render frame where Next briefly shows enabled with a stale slug.
  const effectivePlan = filteredPlans.find((p) => p.slug === draft.planSlug);

  // Synchronous interval switch — keeps `planSlug` only when it matches the
  // newly selected interval; clears it atomically otherwise.
  const switchInterval = useCallback(
    (next: "monthly" | "quarterly") => {
      setDraft((d) => {
        if (d.interval === next) return d;
        const current = plans.find((p) => p.slug === d.planSlug);
        const keepSlug = current?.interval === next ? d.planSlug : "";
        return { ...d, interval: next, planSlug: keepSlug };
      });
    },
    [plans],
  );

  // -- Slug availability: debounced, cached, cancelable ---------------------
  const availabilityCache = useRef<Map<string, SlugAvailabilityReason>>(new Map());
  const checkSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const slug = draft.slug;
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
        console.error("[onboarding] slug check failed", err);
        setSlugStatus({ kind: "error" });
      }
    }, 350);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [draft.slug, checkSlug]);

  const stepIdx = STEPS.findIndex((s) => s.id === draft.step);

  const setStep = (step: StepId) => {
    // Confirm-time revalidation: a draft restored from localStorage may
    // reference a template whose `available` flag flipped, or that no longer
    // exists. The server is authoritative, but bouncing here avoids a wasted
    // create call and gives clearer feedback.
    if (step === "confirm" && !isTemplateSelectable(draft.template)) {
      toast.error("Please choose an available template.");
      setDraft((d) => ({ ...d, step: "template" }));
      return;
    }
    setDraft((d) => ({ ...d, step }));
  };
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].id as StepId);
  const back = () => setStep(STEPS[Math.max(0, stepIdx - 1)].id as StepId);

  const slugRuleOk = SLUG_REGEX.test(draft.slug) && validateSlug(draft.slug).ok;
  const slugBlocks =
    slugStatus.kind === "taken" ||
    slugStatus.kind === "reserved" ||
    slugStatus.kind === "format" ||
    slugStatus.kind === "rate_limited" ||
    slugStatus.kind === "checking";
  const canContinueBasics =
    draft.name.trim().length >= 2 && slugRuleOk && !slugBlocks;
  const canContinueTemplate = isTemplateSelectable(draft.template);
  const canContinuePlan = !!effectivePlan;

  // -- Focus management on step change --------------------------------------
  const nameRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLButtonElement>(null);
  const planRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const target =
      draft.step === "basics"
        ? nameRef.current
        : draft.step === "template"
          ? templateRef.current
          : draft.step === "plan"
            ? planRef.current
            : confirmRef.current;
    target?.focus({ preventScroll: false });
  }, [draft.step]);

  const onCreate = async () => {
    if (busy) return; // double-click guard
    if (!canContinueBasics || !canContinuePlan) {
      toast.error("Complete the previous steps first.");
      return;
    }
    // Confirm-time client revalidation: catch stale drafts before round-trip.
    if (!isTemplateSelectable(draft.template)) {
      setTemplateError("That template is no longer available.");
      toast.error("Please choose an available template.");
      setDraft((d) => ({ ...d, step: "template" }));
      return;
    }
    if (!effectivePlan) {
      setPlanError("That plan is no longer available for this billing period.");
      toast.error("Please reselect your plan.");
      setDraft((d) => ({ ...d, step: "plan" }));
      return;
    }
    setBusy(true);
    setPlanError(null);
    setTemplateError(null);
    try {
      const nicheValue = (["retail", "clinic", "pharmacy"] as const).includes(
        draft.niche as any,
      )
        ? (draft.niche as "retail" | "clinic" | "pharmacy")
        : "retail";
      // Ensure a stable idempotency key is attached to the draft before the
      // call so a retry hits the server-side dedupe path.
      const idempotencyKey = draft.idempotencyKey ?? generateIdempotencyKey();
      if (!draft.idempotencyKey) {
        setDraft((d) => ({ ...d, idempotencyKey }));
      }
      const res = await create({
        data: {
          name: draft.name.trim(),
          slug: draft.slug,
          planSlug: draft.planSlug,
          interval: draft.interval,
          niche: nicheValue,
          template: draft.template as any,
          idempotencyKey,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["my-tenants-stats"] }),
      ]);
      // Mark the draft as submitted with the returned subscription id so a
      // crash-after-create returns the user to the same checkout instead of
      // re-creating a tenant. The draft is cleared by the checkout route on
      // mount (when navigated to with `from=onboarding`).
      flushDraft({
        ...draft,
        idempotencyKey,
        submittedSubscriptionId: res.subscriptionId,
      });
      toast.success("Store created. Let's complete payment.");
      try {
        navigate({
          to: "/checkout/$subscriptionId",
          params: { subscriptionId: res.subscriptionId },
          search: { from: "onboarding" } as any,
        });
        // Fallback: clear the draft a beat after a successful navigate dispatch
        // so users who land successfully don't see resumable onboarding state.
        setTimeout(() => {
          try { window.localStorage.removeItem(DRAFT_KEY); } catch {}
        }, 1500);
      } catch (navErr) {
        // Navigation can't realistically fail in TanStack Router, but if it
        // does we keep the draft and surface a recovery toast so the user
        // can manually retry the handoff.
        console.error("[onboarding] navigate to checkout failed", navErr);
        toast.error("Store created. Tap to continue to checkout.");
      }
    } catch (err) {
      const parsed = parseCreateError(err);
      const msg = parsed.message;
      if (parsed.code === "SLUG_TAKEN") {
        availabilityCache.current.set(draft.slug, "taken");
        setSlugStatus({ kind: "taken" });
        setStep("basics");
      } else if (parsed.code === "PLAN_NOT_AVAILABLE" || parsed.code === "PLAN_INTERVAL_MISMATCH") {
        setPlanError(msg);
        setDraft((d) => ({ ...d, step: "plan", planSlug: "" }));
      } else if (parsed.code === "TEMPLATE_NOT_AVAILABLE") {
        setTemplateError(msg);
        setDraft((d) => ({ ...d, step: "template" }));
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const saveAndExit = () => {
    if (busy) return;
    flushDraft(draft);
    toast.success("Progress saved. You can resume anytime.");
    navigate({ to: "/dashboard" });
  };


  return (
    <PlatformShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Launch your store</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Four quick steps. You can save and come back anytime.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={saveAndExit} disabled={busy}>
            Save & exit
          </Button>
        </div>

        <div className="mb-8">
          <Stepper steps={STEPS as any} current={draft.step} />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
          {draft.step === "basics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Store basics</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Name your store and pick a web address.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Store name</Label>
                <Input
                  id="name"
                  ref={nameRef}
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Acme Goods"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Store address</Label>
                <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                  <Input
                    id="slug"
                    value={draft.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setDraft((d) => ({
                        ...d,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                      }));
                    }}
                    className="border-0 focus-visible:ring-0"
                    placeholder="acme"
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
                <SlugStatusLine
                  slug={draft.slug}
                  status={slugStatus}
                />
              </div>
              <div className="space-y-2">
                <Label>What do you sell?</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {NICHES.map((n) => {
                    const Icon = n.icon;
                    const selected = draft.niche === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        disabled={!n.available}
                        aria-disabled={!n.available}
                        title={!n.available ? "Available next release" : undefined}
                        onClick={() => setDraft((d) => ({ ...d, niche: n.id }))}
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
                        <span className="font-medium">{n.label}</span>
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

          {draft.step === "template" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Choose a template</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start from a polished design. You can customize later.
                </p>
              </div>
              <div
                className="grid sm:grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Storefront template"
                onKeyDown={(e) => {
                  const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
                  if (!keys.includes(e.key)) return;
                  const enabled = TEMPLATES.filter((t) => t.available);
                  if (enabled.length === 0) return;
                  const idx = Math.max(0, enabled.findIndex((t) => t.id === draft.template));
                  let nextIdx = idx;
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (idx + 1) % enabled.length;
                  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIdx = (idx - 1 + enabled.length) % enabled.length;
                  else if (e.key === "Home") nextIdx = 0;
                  else if (e.key === "End") nextIdx = enabled.length - 1;
                  e.preventDefault();
                  const nextId = enabled[nextIdx]!.id;
                  setDraft((d) => ({ ...d, template: nextId }));
                  // Move DOM focus to the newly selected tile.
                  requestAnimationFrame(() => {
                    const el = document.getElementById(`tpl-${nextId}`) as HTMLButtonElement | null;
                    el?.focus();
                  });
                }}
              >
                {TEMPLATES.map((t, i) => {
                  const selected = draft.template === t.id;
                  const eager = i === 0;
                  return (
                    <button
                      key={t.id}
                      id={`tpl-${t.id}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${t.name} — ${t.audience}${t.available ? "" : " (coming soon)"}`}
                      aria-disabled={!t.available}
                      title={!t.available ? t.comingSoonNote ?? "Available next release" : undefined}
                      tabIndex={selected || (!draft.template && i === 0) ? 0 : -1}
                      ref={i === 0 ? templateRef : undefined}
                      disabled={!t.available}
                      onClick={() => t.available && setDraft((d) => ({ ...d, template: t.id }))}
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
                            loading={eager ? "eager" : "lazy"}
                            decoding="async"
                            fetchPriority={eager ? "high" : undefined}
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
                      {!t.available && t.comingSoonNote && (
                        <p className="mt-2 text-[11px] text-muted-foreground">{t.comingSoonNote}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {draft.step === "plan" && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold">Pick your plan</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Switch anytime. Cancel anytime.</p>
                </div>
                <div
                  className="inline-flex items-center rounded-md border border-border p-0.5 text-xs"
                  role="group"
                  aria-label="Billing period"
                >
                  {(["monthly", "quarterly"] as const).map((i) => {
                    const savings = i === "quarterly" ? quarterlySavingsPct("Growth") : 0;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={draft.interval === i}
                        onClick={() => switchInterval(i)}
                        className={
                          "px-3 py-1.5 rounded-sm transition-colors " +
                          (draft.interval === i
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {intervalLabel(i)}
                        {i === "quarterly" && savings > 0 && (
                          <span className="ml-1 text-[10px] uppercase">save {savings}%</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {plansLoading ? (
                <div
                  className="text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  Loading plans…
                </div>
              ) : plansError ? (
                <div
                  className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-foreground"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" aria-hidden />
                    <div className="flex-1">
                      <p className="font-medium">We couldn't load the plans.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Check your connection and try again — your progress is saved.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => refetchPlans()}
                        disabled={plansFetching}
                      >
                        {plansFetching ? (
                          <>
                            <Loader2 className="size-3 mr-1 animate-spin" /> Retrying…
                          </>
                        ) : (
                          "Retry"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : filteredPlans.length === 0 ? (
                <div
                  className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground text-center"
                  role="status"
                  aria-live="polite"
                >
                  No plans available for {intervalLabel(draft.interval).toLowerCase()} billing. Try the other billing period.
                </div>
              ) : (
                <div
                  className="grid sm:grid-cols-2 gap-3"
                  role="radiogroup"
                  aria-label="Subscription plan"
                >
                  {filteredPlans.map((p, i) => {
                    const selected = draft.planSlug === p.slug;
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        ref={i === 0 ? planRef : undefined}
                        onClick={() => setDraft((d) => ({ ...d, planSlug: p.slug }))}
                        className={
                          "text-left rounded-md border p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                          (selected
                            ? "border-foreground bg-accent"
                            : "border-border hover:bg-accent/50")
                        }
                      >
                        <div className="flex items-baseline justify-between">
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-sm font-semibold text-foreground">
                            {formatPlanPrice(p)}
                          </span>
                        </div>
                        {p.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                        )}
                        {Array.isArray(p.features) && p.features.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                            {p.features.slice(0, 4).map((f: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <Check className="size-3 mt-0.5 text-foreground/70" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {draft.step === "confirm" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Confirm and continue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We'll create your store and take you to checkout.
                </p>
              </div>
              {(planError || templateError) && (
                <div
                  className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground"
                  role="alert"
                >
                  {planError ?? templateError}
                </div>
              )}
              <dl className="divide-y divide-border rounded-md border border-border">
                {([
                  { k: "Store name", v: draft.name, step: "basics" as StepId },
                  { k: "Address", v: formatStoreAddress(draft.slug), step: "basics" as StepId },
                  {
                    k: "Industry",
                    v: NICHES.find((n) => n.id === draft.niche)?.label ?? draft.niche,
                    step: "basics" as StepId,
                  },
                  {
                    k: "Template",
                    v: TEMPLATES.find((t) => t.id === draft.template)?.name ?? draft.template,
                    step: "template" as StepId,
                  },
                  { k: "Billing", v: intervalLabel(draft.interval), step: "plan" as StepId },
                  {
                    k: "Plan",
                    v: selectedPlan
                      ? `${selectedPlan.name} · ${formatPlanPrice(selectedPlan)}`
                      : "—",
                    step: "plan" as StepId,
                  },
                ]).map(({ k, v, step }) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <div className="flex items-center gap-3">
                      <dd className="font-medium text-foreground text-right">{v as string}</dd>
                      <button
                        type="button"
                        onClick={() => !busy && setDraft((d) => ({ ...d, step }))}
                        disabled={busy}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                        aria-label={`Edit ${k}`}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Your store will go live once your first payment is approved.
              </p>
            </div>
          )}


          <div className="mt-8 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={back} disabled={stepIdx === 0}>
              <ArrowLeft className="size-4 mr-1" /> Back
            </Button>
            {draft.step === "confirm" ? (
              <Button
                ref={confirmRef}
                onClick={onCreate}
                disabled={busy || !canContinueBasics || !canContinuePlan}
              >
                {busy ? "Creating store…" : "Create store & continue to checkout"}
              </Button>
            ) : (
              <Button
                onClick={next}
                disabled={
                  (draft.step === "basics" && !canContinueBasics) ||
                  (draft.step === "template" && !canContinueTemplate) ||
                  (draft.step === "plan" && !canContinuePlan)
                }
              >
                Continue <ArrowRight className="size-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Need help?{" "}
          <Link to="/contact" className="text-foreground hover:underline">
            Talk to us
          </Link>
          .
        </p>
      </div>
    </PlatformShell>
  );
}

function mapValidation(slug: string): SlugStatus {
  const v = validateSlug(slug);
  return v.ok ? { kind: "idle" } : { kind: v.reason };
}

/**
 * Mint a per-draft idempotency key. Uses crypto.randomUUID() when available
 * (all modern browsers + Workers); falls back to a Math.random hex string in
 * exotic environments. The server treats absent keys as "no dedupe", so the
 * fallback is safe — a duplicate submit would just race the slug uniqueness
 * constraint.
 */
function generateIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  // RFC-4122 v4-shaped fallback.
  const rnd = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${rnd()}${rnd()}-${rnd()}-4${rnd().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rnd().slice(1)}-${rnd()}${rnd()}${rnd()}`;
}

type ParsedCreateError = {
  code: "SLUG_TAKEN" | "PLAN_NOT_AVAILABLE" | "PLAN_INTERVAL_MISMATCH" | "TEMPLATE_NOT_AVAILABLE" | "UNKNOWN";
  message: string;
  step?: "basics" | "template" | "plan";
  field?: string;
};

/**
 * Unpack the structured error envelope produced by createTenantAndSubscription.
 * Falls back to regex sniffing for legacy strings ("already taken") so existing
 * deployments and admin tooling keep working without coordination.
 */
function parseCreateError(err: unknown): ParsedCreateError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  // Try structured payload first.
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
      return {
        code: parsed.code,
        message: parsed.message || raw,
        step: parsed.step,
        field: parsed.field,
      };
    }
  } catch {
    // not JSON — fall through to legacy detection
  }
  if (/already taken/i.test(raw)) {
    return { code: "SLUG_TAKEN", message: raw, step: "basics", field: "slug" };
  }
  return { code: "UNKNOWN", message: raw || "Could not create store" };
}


function reasonToStatus(reason: SlugAvailabilityReason): SlugStatus {
  switch (reason) {
    case "available":
      return { kind: "available" };
    case "taken":
      return { kind: "taken" };
    case "reserved":
      return { kind: "reserved" };
    case "format":
      return { kind: "format" };
    case "rate_limited":
      return { kind: "rate_limited" };
    case "error":
    default:
      return { kind: "error" };
  }
}

function SlugStatusLine({ slug, status }: { slug: string; status: SlugStatus }) {
  if (!slug) {
    return (
      <p id="slug-status" className="text-xs text-muted-foreground" aria-live="polite">
        Your store will live at <span className="font-mono">your-name.coreweb.app</span>
      </p>
    );
  }
  const address = (
    <span className="font-mono text-foreground">{slug}.coreweb.app</span>
  );
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
          Your store will live at {address}
        </p>
      );
  }
}
