import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Check, Minus } from "lucide-react";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { listPlans, type PublicPlan } from "@/lib/billing.functions";
import {
  STATIC_PLANS,
  TIER_ORDER,
  COMPARISON_MATRIX,
  PRICING_FAQ,
  quarterlySavingsPct,
  type StaticInterval,
} from "@/lib/pricing-static";

const plansQueryOptions = queryOptions({
  queryKey: ["plans"],
  queryFn: () => listPlans(),
  staleTime: 5 * 60 * 1000,
});

const searchSchema = z.object({
  interval: z.enum(["monthly", "quarterly"]).catch("monthly"),
});

export const Route = createFileRoute("/pricing")({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQueryOptions),
  head: () => {
    // JSON-LD is generated from the static seed mirror so SSR markup never
    // diverges from the rendered cards. Whenever the DB seed changes, update
    // src/lib/pricing-static.ts in the same commit.
    const productSchema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "CoreWeb",
      description:
        "Hosted storefront platform for modern retailers — Starter, Growth, and Scale plans, billed monthly or quarterly.",
      brand: { "@type": "Brand", name: "CoreWeb" },
      offers: STATIC_PLANS.map((p) => ({
        "@type": "Offer",
        name: `${p.name} (${p.interval === "monthly" ? "Monthly" : "Quarterly"})`,
        price: String(p.price_usd),
        priceCurrency: p.currency,
        category: "subscription",
        url: `/pricing?interval=${p.interval}`,
      })),
    };

    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: PRICING_FAQ.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    };

    return {
      meta: [
        { title: "Pricing — CoreWeb" },
        {
          name: "description",
          content:
            "Simple pricing for Starter, Growth, and Scale. Pay monthly or quarterly via InstaPay, Vodafone Cash, or bank transfer.",
        },
        { property: "og:title", content: "Pricing — CoreWeb" },
        {
          property: "og:description",
          content:
            "Three plans, monthly or quarterly. Local payment methods. No setup fees.",
        },
        { property: "og:url", content: "/pricing" },
        { property: "og:image", content: "/og-image.jpg" },
      ],
      links: [{ rel: "canonical", href: "/pricing" }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(productSchema) },
        { type: "application/ld+json", children: JSON.stringify(faqSchema) },
      ],
    };
  },
  pendingComponent: PricingPending,
  errorComponent: PricingError,
  component: PricingPage,
});

function PricingError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <PlatformShell>
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing isn't loading right now</h1>
        <p className="mt-3 text-sm text-muted-foreground break-words">{error.message}</p>
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="mt-6 inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent transition-colors"
        >
          Try again
        </button>
      </section>
    </PlatformShell>
  );
}

function PricingPending() {
  return (
    <PlatformShell>
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-16 text-center">
          <Skeleton className="mx-auto h-9 w-72" />
          <Skeleton className="mx-auto mt-4 h-5 w-96 max-w-full" />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <Skeleton className="mx-auto h-10 w-64" />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[420px] w-full rounded-lg" />
          ))}
        </div>
      </section>
    </PlatformShell>
  );
}

function PricingPage() {
  const { data } = useSuspenseQuery(plansQueryOptions);
  const { interval } = Route.useSearch();
  const navigate = useNavigate({ from: "/pricing" });

  const plans: PublicPlan[] = data.plans;

  // Group plans by tier name, then pick the row matching the active interval.
  // Fall back to monthly if a quarterly row is missing for a tier.
  const cards = TIER_ORDER.map((tier) => {
    const match = plans.find((p) => p.name === tier && p.interval === interval);
    const fallback = plans.find((p) => p.name === tier && p.interval === "monthly");
    return match ?? fallback ?? null;
  }).filter((p): p is PublicPlan => p !== null);

  const setInterval = (next: StaticInterval) => {
    navigate({ search: { interval: next }, replace: true });
  };

  return (
    <PlatformShell>
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Simple pricing.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Pay in USD — or the EGP equivalent — via InstaPay, Vodafone Cash, or bank transfer.
          </p>
        </div>
      </section>

      {/* Interval toggle */}
      <section className="mx-auto max-w-6xl px-6 pt-10">
        <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1 text-sm">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            aria-pressed={interval === "monthly"}
            className={
              "h-8 min-w-[112px] rounded-full px-4 font-medium transition-colors " +
              (interval === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("quarterly")}
            aria-pressed={interval === "quarterly"}
            className={
              "h-8 min-w-[152px] rounded-full px-4 font-medium transition-colors inline-flex items-center justify-center gap-2 " +
              (interval === "quarterly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            Quarterly
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                (interval === "quarterly"
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400")
              }
            >
              Save ~{quarterlySavingsPct("Growth")}%
            </span>
          </button>
        </div>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Pricing is coming soon. Check back shortly.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((p) => {
              const periodLabel = p.interval === "quarterly" ? "/quarter" : "/month";
              return (
                <div
                  key={p.slug}
                  className={
                    "relative flex min-h-[440px] flex-col rounded-lg border bg-card p-6 " +
                    (p.highlight ? "border-foreground shadow-sm" : "border-border")
                  }
                >
                  {p.highlight && (
                    <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">
                      ${p.price_usd}
                    </span>
                    <span className="text-sm text-muted-foreground">{periodLabel}</span>
                  </div>
                  {p.interval === "quarterly" && (
                    <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                      Save ~{quarterlySavingsPct(p.name as "Starter" | "Growth" | "Scale")}% vs paying monthly
                    </p>
                  )}
                  <ul className="mt-6 space-y-2 text-sm">
                    {(p.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-6">
                    <Link
                      to="/onboarding"
                      search={{ plan: p.slug }}
                      className={
                        "inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors " +
                        (p.highlight
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border border-input bg-background hover:bg-accent")
                      }
                    >
                      Choose {p.name}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prices in USD. Charged in EGP at the live exchange rate at checkout.{" "}
          <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
            Questions?
          </Link>
        </p>
      </section>

      {/* Comparison table (≥ sm) */}
      <section className="hidden sm:block border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Compare plans
          </h2>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 text-left font-medium text-muted-foreground">Feature</th>
                  {TIER_ORDER.map((tier) => (
                    <th key={tier} className="px-4 py-3 text-left font-semibold">
                      {tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_MATRIX.map((row) => (
                  <tr key={row.label} className="border-b border-border/60">
                    <td className="py-3 pr-4 text-muted-foreground">{row.label}</td>
                    {TIER_ORDER.map((tier) => {
                      const v = row.values[tier];
                      const isEmpty = v === "—";
                      return (
                        <td key={tier} className="px-4 py-3">
                          {isEmpty ? (
                            <Minus className="size-4 text-muted-foreground/60" aria-label="Not included" />
                          ) : (
                            <span>{v}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Pricing FAQ
          </h2>
          <Accordion type="single" collapsible className="mt-8 w-full">
            {PRICING_FAQ.map((f, i) => (
              <AccordionItem key={f.question} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{f.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {f.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </PlatformShell>
  );
}
