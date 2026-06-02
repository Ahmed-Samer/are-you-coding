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
  name: "CoreWeb",
  url: "/",
  logo: "/og-image.jpg",
  description:
    "CoreWeb gives operators a premium, conversion-ready storefront — zero setup, hosted, and fast.",
  sameAs: [] as string[],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: "/contact",
  },
};

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — CoreWeb" },
      {
        name: "description",
        content:
          "We build premium, conversion-ready storefronts for retailers, clinics, and pharmacies — zero setup, hosted, and fast.",
      },
      { property: "og:title", content: "About — CoreWeb" },
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
    body: "Local payments, local support, local pricing — built for the region.",
  },
];

// TODO: replace with live numbers once the analytics pipeline is wired.
const TRUST_METRICS = [
  { icon: Store, value: "1,200+", label: "Stores launched" },
  { icon: Globe2, value: "14", label: "Regions served" },
  { icon: Activity, value: "99.98%", label: "Platform uptime" },
  { icon: Gauge, value: "98", label: "Avg. Lighthouse score" },
];

// TODO: replace with approved customer quote.
const CUSTOMER_QUOTE = {
  quote:
    "We launched in an afternoon, looked premium from day one, and our conversion rate doubled in the first month. The team actually answers when we ask for help.",
  name: "Amelia Okafor",
  role: "Owner",
  store: "Ode Apothecary",
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
          "opacity 400ms ease-out, transform 400ms ease-out",
        transitionDelay: `${delay * 1000}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
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
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-24">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            About
          </span>
          <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">
            We give operators a premium storefront — without the overhead.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Storefront started after watching too many great shops launch with
            broken websites, slow hosting, and a maze of plugins. We thought
            retailers, clinics, and pharmacies deserved better — so we built it.
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-6 py-20 grid lg:grid-cols-3 gap-10">
          <MaybeMotion reduced={reduced}>
            <h2 className="text-2xl font-semibold tracking-tight">Our mission</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Make a beautiful, fast, conversion-ready online presence the
              default for every modern retailer in the region.
            </p>
          </MaybeMotion>
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
            {VALUES.map((v, i) => (
              <MaybeMotion
                key={v.title}
                reduced={reduced}
                delay={i * 0.06}
                className="rounded-xl border border-border bg-card p-5"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
                  <v.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{v.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {v.body}
                </p>
              </MaybeMotion>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border" aria-labelledby="trust-heading">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <MaybeMotion reduced={reduced}>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Proof
            </span>
            <h2
              id="trust-heading"
              className="mt-3 text-2xl font-semibold tracking-tight"
            >
              Numbers operators care about.
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              We hold ourselves to a strict performance and reliability budget on
              every store we ship.
            </p>
          </MaybeMotion>
          <div
            className="mt-10 grid gap-4 grid-cols-2 lg:grid-cols-4"
            role="list"
          >
            {TRUST_METRICS.map((m, i) => (
              <MaybeMotion
                key={m.label}
                reduced={reduced}
                delay={i * 0.06}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div role="listitem">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
                    <m.icon className="size-5" aria-hidden />
                  </span>
                  <div className="mt-4 text-3xl font-semibold tracking-tight">
                    {m.value}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {m.label}
                  </div>
                </div>
              </MaybeMotion>
            ))}
          </div>
          <MaybeMotion
            reduced={reduced}
            delay={0.1}
            className="mt-8 rounded-2xl border border-border bg-card p-6 sm:p-8"
          >
            <figure>
              <blockquote className="text-lg sm:text-xl leading-relaxed text-foreground">
                “{CUSTOMER_QUOTE.quote}”
              </blockquote>
              <figcaption className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {CUSTOMER_QUOTE.name}
                </span>{" "}
                — {CUSTOMER_QUOTE.role}, {CUSTOMER_QUOTE.store}
              </figcaption>
            </figure>
          </MaybeMotion>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <MaybeMotion reduced={reduced}>
            <h2 className="text-2xl font-semibold tracking-tight">The team</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              A small, senior team of designers, engineers, and operators. We
              ship every week and answer support ourselves.
            </p>
          </MaybeMotion>
          {/*
            Intentional "small senior team" treatment — no fake avatars or
            placeholder bios. If real team photos are added later: explicit
            width/height, loading="lazy", AVIF/WebP under src/assets/.
          */}
          <MaybeMotion
            reduced={reduced}
            delay={0.05}
            className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8"
          >
            <p className="text-base sm:text-lg leading-relaxed text-foreground max-w-3xl">
              We're deliberately small. Every engineer reviews their own support
              tickets, every designer ships templates that operators actually
              use, and every release goes out only after it's tested on a real
              store. No outsourced support, no junior-only on-call.
            </p>
            <ul
              className="mt-6 flex flex-wrap gap-2"
              aria-label="Team disciplines"
            >
              {TEAM_PILLARS.map((p) => (
                <li
                  key={p}
                  className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground"
                >
                  {p}
                </li>
              ))}
            </ul>
          </MaybeMotion>
        </div>
      </section>

      <section aria-labelledby="cta-heading">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-24 text-center">
          <MaybeMotion reduced={reduced}>
            <h2
              id="cta-heading"
              className="text-3xl sm:text-4xl font-semibold tracking-tight"
            >
              Ready to launch your storefront?
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Pick a template, plug in your products, and you're live in an
              afternoon.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/signup"
                onMouseEnter={preloadSignup}
                onFocus={preloadSignup}
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get started
                <ArrowRight className="ml-2 size-4" aria-hidden />
              </Link>
              <Link
                to="/templates"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Browse templates
              </Link>
            </div>
          </MaybeMotion>
        </div>
      </section>
    </PlatformShell>
  );
}
