import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { useReducedMotion } from "@/lib/use-intent-trigger";
import {
  Target,
  Heart,
  Users,
  Sparkles,
  ArrowRight,
  Store,
  Globe2,
  Activity,
  Gauge,
} from "lucide-react";

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "RentWebify",
  url: "https://rentwebify.com",
  logo: "/og-image.jpg",
  description:
    "RentWebify gives operators a premium, conversion-ready storefront — zero setup, hosted, and fast.",
  sameAs: [] as string[],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: "https://rentwebify.com/contact",
  },
};

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — RentWebify" },
      {
        name: "description",
        content:
          "We build premium, conversion-ready storefronts for retailers, clinics, and hardware stores — zero setup, hosted, and fast.",
      },
      { property: "og:title", content: "About — RentWebify" },
      {
        property: "og:description",
        content:
          "Our mission: give every operator a premium online presence in minutes.",
      },
      { property: "og:url", content: "/about" },
      { property: "og:image", content: "/og-image.jpg" },
      { name: "twitter:image", content: "/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(ORG_JSON_LD),
      },
    ],
  }),
  component: AboutPage,
});

const VALUES = [
  {
    icon: Target,
    title: "Operator-first",
    body: "Every decision is made for the person running the shop — not for engineers.",
  },
  {
    icon: Heart,
    title: "Premium by default",
    body: "Templates feel hand-crafted out of the box. No theme bazaar, no clutter.",
  },
  {
    icon: Sparkles,
    title: "Fast, always",
    body: "A strict performance budget on every store. Speed is a feature, not an option.",
  },
  {
    icon: Users,
    title: "Local-friendly",
    body: "Local EGP payments, local support, local pricing — built for the region.",
  },
];

// TODO: replace with live numbers once the analytics pipeline is wired.
const TRUST_METRICS = [
  { icon: Store, value: "1,200+", label: "Stores launched" },
  { icon: Globe2, value: "14", label: "Regions served" },
  { icon: Activity, value: "99.98%", label: "Platform uptime" },
  { icon: Gauge, value: "98", label: "Avg. Lighthouse score" },
];

const CUSTOMER_QUOTE = {
  quote:
    "We launched in an afternoon, looked premium from day one, and our conversion rate doubled in the first month. RentWebify completely changed how we handle online orders.",
  name: "Ahmed Mostafa",
  role: "Operations Manager",
  store: "TechGear",
};

const TEAM_PILLARS = [
  "Product",
  "Engineering",
  "Design",
  "Operator success",
];

function MaybeMotion({
  reduced,
  delay = 0,
  children,
  className,
}: {
  reduced: boolean;
  delay?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "-10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);

  const style = reduced
    ? undefined
    : ({
        transition:
          "opacity 500ms cubic-bezier(0.4, 0, 0.2, 1), transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
        transitionDelay: `${delay * 1000}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        willChange: visible ? undefined : "opacity, transform",
      } as React.CSSProperties);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

function AboutPage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const preloadSignup = () => {
    void router.preloadRoute({ to: "/signup" });
  };

  return (
    <PlatformShell>
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28 text-center sm:text-left">
          <span className="text-sm font-bold uppercase tracking-widest text-primary">
            About RentWebify
          </span>
          <h1 className="mt-4 text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
            We build the infrastructure. <br className="hidden sm:block" />
            <span className="text-muted-foreground">You build the business.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto sm:mx-0">
            RentWebify started after watching too many great brands struggle with
            broken websites, slow hosting, and a maze of expensive plugins. We thought
            retailers and operators deserved an enterprise-grade solution out of the box.
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-secondary/20">
        <div className="mx-auto max-w-7xl px-6 py-24 grid lg:grid-cols-3 gap-12">
          <MaybeMotion reduced={reduced}>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Our mission</h2>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              Make a beautiful, fast, and conversion-ready online presence the
              default standard for every modern retailer in the region.
            </p>
          </MaybeMotion>
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-6">
            {VALUES.map((v, i) => (
              <MaybeMotion
                key={v.title}
                reduced={reduced}
                delay={i * 0.08}
                className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                <span className="inline-flex size-12 items-center justify-center rounded-xl border border-border bg-primary/10 text-primary">
                  <v.icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {v.body}
                </p>
              </MaybeMotion>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background" aria-labelledby="trust-heading">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <MaybeMotion reduced={reduced} className="text-center sm:text-left">
            <span className="text-sm font-bold uppercase tracking-widest text-primary">
              Proof
            </span>
            <h2
              id="trust-heading"
              className="mt-3 text-3xl font-bold tracking-tight"
            >
              Numbers operators care about.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto sm:mx-0">
              We hold ourselves to a strict performance and reliability budget on
              every store we ship to ensure maximum conversion rates.
            </p>
          </MaybeMotion>
          <div
            className="mt-12 grid gap-6 grid-cols-2 lg:grid-cols-4"
            role="list"
          >
            {TRUST_METRICS.map((m, i) => (
              <MaybeMotion
                key={m.label}
                reduced={reduced}
                delay={i * 0.08}
                className="rounded-2xl border border-border/50 bg-card p-6 text-center shadow-sm"
              >
                <div role="listitem">
                  <span className="inline-flex size-12 items-center justify-center rounded-xl bg-secondary text-foreground">
                    <m.icon className="size-6" aria-hidden />
                  </span>
                  <div className="mt-5 text-4xl font-black tracking-tight text-foreground">
                    {m.value}
                  </div>
                  <div className="mt-2 text-sm font-medium text-muted-foreground">
                    {m.label}
                  </div>
                </div>
              </MaybeMotion>
            ))}
          </div>
          <MaybeMotion
            reduced={reduced}
            delay={0.15}
            className="mt-12 rounded-3xl border border-primary/20 bg-primary/5 p-8 sm:p-10"
          >
            <figure className="max-w-4xl mx-auto text-center">
              <blockquote className="text-xl sm:text-2xl font-medium leading-relaxed text-foreground">
                “{CUSTOMER_QUOTE.quote}”
              </blockquote>
              <figcaption className="mt-6 text-sm text-muted-foreground">
                <span className="font-bold text-foreground text-base">
                  {CUSTOMER_QUOTE.name}
                </span>{" "}
                <span className="mx-1">—</span> {CUSTOMER_QUOTE.role}, {CUSTOMER_QUOTE.store}
              </figcaption>
            </figure>
          </MaybeMotion>
        </div>
      </section>

      <section className="border-b border-border bg-secondary/10">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <MaybeMotion reduced={reduced} className="max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight">The Team</h2>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              We're a dedicated team of engineers, designers, and operators. We ship high-quality features rapidly and handle support directly.
            </p>
          </MaybeMotion>
          
          <MaybeMotion
            reduced={reduced}
            delay={0.1}
            className="mt-12 rounded-3xl border border-border bg-card p-8 sm:p-12 shadow-sm"
          >
            <p className="text-lg sm:text-xl leading-relaxed text-foreground max-w-4xl">
              We operate with a lean, elite mindset. Our engineers directly monitor system stability, our designers create templates strictly optimized for sales, and every update is battle-tested. No outsourced support, just direct access to the builders.
            </p>
            <ul
              className="mt-8 flex flex-wrap gap-3"
              aria-label="Team disciplines"
            >
              {TEAM_PILLARS.map((p) => (
                <li
                  key={p}
                  className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary"
                >
                  {p}
                </li>
              ))}
            </ul>
          </MaybeMotion>
        </div>
      </section>

      <section aria-labelledby="cta-heading" className="bg-background">
        <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32 text-center">
          <MaybeMotion reduced={reduced}>
            <h2
              id="cta-heading"
              className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground"
            >
              Ready to scale your sales?
            </h2>
            <p className="mt-6 text-xl text-muted-foreground">
              Select a template, sync your inventory, and start receiving orders today.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                onMouseEnter={preloadSignup}
                onFocus={preloadSignup}
                className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-8 text-base font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25"
              >
                Start 14-Day Free Trial
                <ArrowRight className="ml-2 size-5" aria-hidden />
              </Link>
              <Link
                to="/templates"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-background px-8 text-base font-bold text-foreground hover:bg-secondary transition-colors"
              >
                Explore Templates
              </Link>
            </div>
          </MaybeMotion>
        </div>
      </section>
    </PlatformShell>
  );
}