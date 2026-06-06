import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  X,
  Globe,
  Gauge,
  Settings2,
  ServerCog,
  ShoppingBag,
  Stethoscope,
  Pill,
  ShieldCheck,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeader } from "./LandingPage";
import { ResultsBand } from "./ResultsBand";
import { STATIC_PLANS, TIER_ORDER } from "@/lib/pricing-static";

export function LandingBelowFold() {
  return (
    <>
      <Templates />
      <Features />
      <ResultsBand />
      <Testimonials />
      <Pricing />
      <Comparison />
      <FAQ />
      <CTA />
    </>
  );
}

/* ─────────────────────── Templates ─────────────────────── */
function Templates() {
  const templates = [
    {
      name: "Retail Store",
      tag: "Available now",
      icon: ShoppingBag,
      blurb: "Product catalog, categories, cart, and WhatsApp checkout.",
      available: true,
    },
    {
      name: "Clinic & Booking",
      tag: "Coming soon",
      icon: Stethoscope,
      blurb: "Doctor profiles, services, and appointment requests over WhatsApp.",
      available: false,
    },
    {
      name: "Pharmacy",
      tag: "Coming soon",
      icon: Pill,
      blurb: "Inventory-aware catalog with prescription upload and delivery.",
      available: false,
    },
  ];
  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow="Templates"
          title="Premium templates, built for your niche."
          subtitle="Start with a template that already converts. Customize colors, copy, and content in minutes."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div
              key={t.name}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="relative aspect-[4/3] border-b border-border bg-background">
                <div
                  className="absolute inset-0 opacity-60"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                  aria-hidden
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <t.icon className="size-12 text-foreground/80" strokeWidth={1.25} />
                </div>
                {!t.available && (
                  <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px]" />
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t.name}</h3>
                  <Badge
                    variant={t.available ? "default" : "secondary"}
                    className="text-[10px] uppercase tracking-wider"
                  >
                    {t.tag}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {t.blurb}
                </p>
                <div className="mt-5">
                  {t.available ? (
                    <Button asChild size="sm" className="h-8">
                      <Link to="/signup">
                        Use template <ArrowRight className="ml-1.5 size-3.5" />
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8" disabled>
                      Notify me
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Features ─────────────────────── */
function Features() {
  const features = [
    { icon: ServerCog, title: "Zero hosting setup", body: "We host, scale, and renew SSL automatically. Your store is live the moment you publish." },
    { icon: Globe, title: "Custom domains ready", body: "Start on a free subdomain, then connect any domain you own with a single CNAME." },
    { icon: Settings2, title: "Intuitive dashboard", body: "Manage products, orders, and content from a clean, focused control panel." },
    { icon: Gauge, title: "Lightning fast", body: "Server-rendered pages, optimized images, and a strict performance budget on every store." },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow="Platform"
          title="Everything you need. Nothing you don't."
          subtitle="A focused set of capabilities, engineered for retail operators who want to move fast."
        />
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="bg-card p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Testimonials ─────────────────────── */
function Testimonials() {
  const items = [
    {
      quote:
        "We launched in an afternoon and took our first WhatsApp orders the same day. The whole catalog is finally one tap away.",
      name: "Nadia M.",
      role: "Founder, Atelier",
    },
    {
      quote:
        "The templates feel hand-crafted. We retired our old slow Shopify theme and never looked back.",
      name: "Karim S.",
      role: "Operations, MediPlus",
    },
    {
      quote:
        "Local payments and a clean dashboard. Everything we asked for, nothing we didn't.",
      name: "Hala A.",
      role: "Owner, Boutique",
    },
  ];
  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeader
          eyebrow="Testimonials"
          title="Operators love the speed."
          subtitle="Honest words from shops running on Storefront today."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {items.map((t) => (
            <figure
              key={t.name}
              className="rounded-xl border border-border bg-card p-6 flex flex-col"
            >
              <Quote className="size-5 text-muted-foreground" />
              <blockquote className="mt-4 text-sm leading-relaxed text-foreground/90 flex-1">
                "{t.quote}"
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <div className="size-9 rounded-full bg-secondary border border-border" />
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Pricing ─────────────────────── */
type Billing = "monthly" | "quarterly";

function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");

  const plansData = TIER_ORDER.map((tier) => {
    const monthlyPlan = STATIC_PLANS.find((p) => p.name === tier && p.interval === "monthly")!;
    const quarterlyPlan = STATIC_PLANS.find((p) => p.name === tier && p.interval === "quarterly")!;
    return {
      name: tier,
      blurb: monthlyPlan.description,
      monthly: monthlyPlan.price_usd,
      quarterly: quarterlyPlan.price_usd,
      slug: monthlyPlan.slug.replace("-monthly", ""),
      features: monthlyPlan.features,
      highlighted: monthlyPlan.highlight,
    };
  });

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow="Pricing"
          title="Simple, transparent pricing."
          subtitle="Start on monthly, save 20% on quarterly. Cancel anytime."
        />
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-border bg-background p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={"h-8 rounded-full px-4 text-sm font-medium transition-colors cursor-pointer " + (billing === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("quarterly")}
              className={"h-8 rounded-full px-4 text-sm font-medium transition-colors inline-flex items-center gap-2 cursor-pointer " + (billing === "quarterly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              Quarterly
              <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + (billing === "quarterly" ? "bg-background text-foreground" : "bg-foreground text-background")}>
                Save 20%
              </span>
            </button>
          </div>
        </div>
        <div className="mt-8 mx-auto max-w-3xl rounded-xl border border-border bg-background p-4 flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
            <ShieldCheck className="size-4" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-foreground">Local EGP transfers supported</p>
            <p className="text-muted-foreground">
              Pay in USD, or settle locally via InstaPay, Vodafone Cash, or bank
              transfer. Invoices issued in your preferred currency.
            </p>
          </div>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {plansData.map((p) => {
            const price = billing === "monthly" ? p.monthly : p.quarterly;
            return (
              <div
                key={p.name}
                className={"relative flex flex-col rounded-xl border bg-card p-6 " + (p.highlighted ? "border-foreground shadow-sm" : "border-border")}
              >
                {p.highlighted && (<Badge className="absolute -top-3 right-6">Most popular</Badge>)}
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">${price}</span>
                  <span className="text-muted-foreground text-sm">/mo USD</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {billing === "quarterly" ? "Billed quarterly" : "Billed monthly"}
                </p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-foreground/90">
                      <Check className="mt-0.5 size-4 text-foreground" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant={p.highlighted ? "default" : "outline"} className="mt-8 h-10">
                  <Link to="/onboarding" search={{ plan: `${p.slug}-${billing}` }}>
                    Start with {p.name}
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Comparison ─────────────────────── */
function Comparison() {
  const rows: Array<{ feature: string; storefront: boolean | string; shopify: boolean | string; custom: boolean | string }> = [
    { feature: "Setup time", storefront: "Minutes", shopify: "Hours", custom: "Weeks" },
    { feature: "Built-in WhatsApp checkout", storefront: true, shopify: false, custom: false },
    { feature: "Local EGP payments", storefront: true, shopify: "Limited", custom: "DIY" },
    { feature: "Hosting & SSL included", storefront: true, shopify: true, custom: false },
    { feature: "Premium templates by default", storefront: true, shopify: "Paid", custom: "DIY" },
    { feature: "Monthly cost (entry)", storefront: "$15", shopify: "$29+", custom: "$200+" },
  ];
  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeader
          eyebrow="Compare"
          title="Storefront vs. the alternatives."
          subtitle="A straightforward comparison against the most common options."
        />
        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-sm border border-border rounded-xl overflow-hidden bg-card">
            <thead className="bg-secondary/60">
              <tr className="text-left">
                <th className="p-4 font-medium text-muted-foreground">Feature</th>
                <th className="p-4 font-semibold">Storefront</th>
                <th className="p-4 font-medium text-muted-foreground">Shopify</th>
                <th className="p-4 font-medium text-muted-foreground">Custom build</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.feature} className={i % 2 === 0 ? "" : "bg-secondary/20"}>
                  <td className="p-4 text-foreground/90">{r.feature}</td>
                  <CellValue v={r.storefront} primary />
                  <CellValue v={r.shopify} />
                  <CellValue v={r.custom} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CellValue({ v, primary }: { v: boolean | string; primary?: boolean }) {
  if (typeof v === "boolean") {
    return (
      <td className="p-4">
        {v ? (
          <Check className={"size-4 " + (primary ? "text-foreground" : "text-muted-foreground")} />
        ) : (
          <X className="size-4 text-muted-foreground/60" />
        )}
      </td>
    );
  }
  return <td className={"p-4 " + (primary ? "font-semibold" : "text-muted-foreground")}>{v}</td>;
}

/* ─────────────────────── FAQ ─────────────────────── */
const FAQ_ITEMS = [
  { q: "Do I need a credit card to start?", a: "No. The 14-day trial requires no payment details. Add billing whenever you're ready to publish." },
  { q: "Can I use my own domain?", a: "Yes. Connect any domain you own with a single CNAME — we handle SSL automatically." },
  { q: "How does WhatsApp checkout work?", a: "Customers add items to a cart and tap Order. The order is delivered to your WhatsApp Business number as a structured message." },
  { q: "Can I pay in EGP?", a: "Yes. We accept InstaPay, Vodafone Cash, and local bank transfer in addition to USD card payments." },
  { q: "Can I migrate from Shopify or WooCommerce?", a: "Yes. Import a CSV of products and we'll match images, prices, and categories automatically." },
];

function FAQ() {
  return (
    <section className="border-b border-border" id="faq">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <SectionHeader
          eyebrow="FAQ"
          title="Common questions."
          subtitle="Can't find what you need? Reach us via the contact page."
        />
        <Accordion type="single" collapsible className="mt-10">
          {FAQ_ITEMS.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger>{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ_ITEMS.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }),
          }}
        />
      </div>
    </section>
  );
}

/* ─────────────────────── Closing CTA ─────────────────────── */
function CTA() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
        <div className="rounded-2xl border border-border bg-card p-10 sm:p-14 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Your storefront, live today.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Spin up a premium store in minutes and start taking WhatsApp orders
            the same day.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-6">
              <Link to="/signup">
                Start free trial <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-6">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
