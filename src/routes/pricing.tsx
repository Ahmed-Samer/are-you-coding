import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Check, Minus, Zap } from "lucide-react";
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
    const productSchema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "RentWebify",
      description:
        "High-performance Website-as-a-Service infrastructure for modern retailers. Zero setup fees.",
      brand: { "@type": "Brand", name: "RentWebify" },
      offers: STATIC_PLANS.map((p) => ({
        "@type": "Offer",
        name: `${p.name} (${p.interval === "monthly" ? "Monthly" : "Quarterly"})`,
        price: String(p.price_usd),
        priceCurrency: p.currency,
        category: "subscription",
        url: `https://rentwebify.com/pricing?interval=${p.interval}`,
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
        { title: "Pricing — RentWebify" },
        {
          name: "description",
          content:
            "Transparent pricing for scaling brands. Pay in EGP via InstaPay or Vodafone Cash. Zero commissions on your sales.",
        },
        { property: "og:title", content: "Pricing — RentWebify" },
        {
          property: "og:description",
          content:
            "Enterprise-grade storefronts at simple monthly or quarterly rates. No hidden fees.",
        },
        { property: "og:url", content: "https://rentwebify.com/pricing" },
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
        <h1 className="text-2xl font-semibold tracking-tight">Pricing is currently unavailable</h1>
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
      <section className="border-b border-border bg-secondary/10">
        <div className="mx-auto max-w-7xl px-6 py-20 text-center">
          <Skeleton className="mx-auto h-12 w-80" />
          <Skeleton className="mx-auto mt-4 h-6 w-96 max-w-full" />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <Skeleton className="mx-auto h-12 w-72 rounded-full" />
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[500px] w-full rounded-2xl" />
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
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28 text-center">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-tight">
            Transparent pricing. <br className="hidden sm:block" />
            <span className="text-muted-foreground">Zero commissions.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Pay in USD — or the EGP equivalent — via InstaPay, Vodafone Cash, or direct bank transfer.
          </p>
        </div>
      </section>

      {/* Interval toggle */}
      <section className="mx-auto max-w-6xl px-6 pt-12">
        <div className="mx-auto flex w-fit items-center p-1.5 rounded-full border border-border/50 bg-secondary/50 shadow-inner">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            aria-pressed={interval === "monthly"}
            className={
              "h-10 min-w-[120px] rounded-full px-6 font-bold transition-all " +
              (interval === "monthly"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
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
              "h-10 min-w-[180px] rounded-full px-6 font-bold transition-all inline-flex items-center justify-center gap-2 " +
              (interval === "quarterly"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            Quarterly
            <span
              className={
                "rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider " +
                (interval === "quarterly"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400")
              }
            >
              Save ~{quarterlySavingsPct("Growth")}%
            </span>
          </button>
        </div>
      </section>

      {/* Plan cards */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center text-muted-foreground">
            Pricing configuration is loading. Check back shortly.
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((p) => {
              const periodLabel = p.interval === "quarterly" ? "/ quarter" : "/ month";
              const isPopular = p.highlight;
              return (
                <div
                  key={p.slug}
                  className={
                    "relative flex flex-col rounded-3xl border bg-card p-8 transition-all duration-300 " +
                    (isPopular ? "border-primary shadow-xl scale-100 lg:scale-105 z-10" : "border-border shadow-sm hover:shadow-md")
                  }
                >
                  {isPopular && (
                    <div className="absolute -top-4 left-0 right-0 mx-auto w-fit px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                      <Zap className="size-3.5 fill-current" />
                      Most Popular
                    </div>
                  )}
                  <h3 className="text-2xl font-bold mt-2">{p.name}</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed h-10">{p.description}</p>
                  
                  <div className="mt-8 flex items-end gap-2 border-b border-border/50 pb-8">
                    <span className="text-5xl font-black tracking-tight tabular-nums">
                      ${p.price_usd}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground mb-1">{periodLabel}</span>
                  </div>
                  
                  {p.interval === "quarterly" && (
                    <p className="mt-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 w-fit px-3 py-1 rounded-full">
                      Save ~{quarterlySavingsPct(p.name as "Starter" | "Growth" | "Scale")}% vs monthly
                    </p>
                  )}
                  
                  <ul className="mt-8 space-y-4 text-sm flex-1">
                    {(p.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-3 text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span className="font-medium text-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <div className="mt-10 pt-4">
                    <Link
                      to="/onboarding"
                      search={{ plan: p.slug }}
                      className={
                        "inline-flex h-12 w-full items-center justify-center rounded-lg px-6 text-base font-bold transition-all " +
                        (isPopular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-primary/25"
                          : "border border-input bg-secondary hover:bg-secondary/80")
                      }
                    >
                      Deploy {p.name}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-12 text-center text-sm font-medium text-muted-foreground">
          Prices are fixed in USD and charged in EGP at the live bank exchange rate at checkout.{" "}
          <Link to="/contact" className="text-primary underline underline-offset-4 hover:opacity-80">
            Have questions? Contact us.
          </Link>
        </p>
      </section>

      {/* Comparison table */}
      <section className="hidden sm:block border-t border-border bg-background">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
            Compare platform features
          </h2>
          <div className="mt-16 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-6 py-5 font-bold text-muted-foreground w-1/3">Feature</th>
                  {TIER_ORDER.map((tier) => (
                    <th key={tier} className="px-6 py-5 font-bold text-foreground">
                      {tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {COMPARISON_MATRIX.map((row) => (
                  <tr key={row.label} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-muted-foreground">{row.label}</td>
                    {TIER_ORDER.map((tier) => {
                      const v = row.values[tier];
                      const isEmpty = v === "—";
                      return (
                        <td key={tier} className="px-6 py-4">
                          {isEmpty ? (
                            <Minus className="size-5 text-muted-foreground/40" aria-label="Not included" />
                          ) : (
                            <span className="font-semibold text-foreground">{v}</span>
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
      <section className="border-t border-border bg-secondary/10">
        <div className="mx-auto max-w-4xl px-6 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="mt-12 w-full space-y-4">
            {PRICING_FAQ.map((f, i) => (
              <AccordionItem key={f.question} value={`item-${i}`} className="border border-border/50 bg-background rounded-lg px-6">
                <AccordionTrigger className="text-left font-bold text-base hover:no-underline hover:text-primary py-6">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-base leading-relaxed pb-6 pt-0">
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