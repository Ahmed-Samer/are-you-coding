import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  X,
  LayoutTemplate,
  Upload,
  MessageCircle,
  Loader2,
  Zap,
} from "lucide-react";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeadCaptureModal } from "./LeadCaptureModal";
import { useLeadCapture } from "@/lib/use-lead-capture";
import {
  useIntentTrigger,
  useReducedMotion,
} from "@/lib/use-intent-trigger";

const BelowFold = lazy(() =>
  import("./LandingBelowFold").then((m) => ({ default: m.LandingBelowFold })),
);

export function LandingPage() {
  return (
    <PlatformShell>
      <Hero />
      <LogosStrip />
      <HowItWorks />
      <Suspense
        fallback={
          <div
            className="min-h-[720px] sm:min-h-[900px] flex items-center justify-center"
            aria-hidden
          >
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <BelowFold />
      </Suspense>
      <StickyCTA />
      <ExitIntent />
    </PlatformShell>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function Hero() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const inlineId = useId();
  const [email, setEmail] = useState("");
  const { status, error, capture } = useLeadCapture();
  const pending = status === "pending" || status === "validating";

  const prefetchSignup = useCallback(() => {
    void router.preloadRoute({ to: "/signup" }).catch(() => undefined);
  }, [router]);

  return (
    <section className="relative border-b border-border bg-background min-h-[640px] sm:min-h-[720px] overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          opacity: reduced ? 0.15 : 0.25,
          backgroundImage:
            "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse at top, black 40%, transparent 75%)",
        }}
        aria-hidden
      />
      
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 relative z-10">
        <div className="max-w-3xl">
          <Badge
            variant="outline"
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 border-primary/20 backdrop-blur-sm shadow-sm"
          >
            <Zap className="mr-2 inline-block size-3.5 fill-current" />
            RentWebify 2.0 is now live
          </Badge>
          
          <h1 className="mt-6 text-5xl sm:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
            Scale your sales. <br />
            <span className="text-muted-foreground font-medium">Zero infrastructure.</span>
          </h1>
          
          <p className="mt-6 text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Launch lightning-fast, high-converting stores designed for massive ad traffic. From hardware and airsoft gear to pharmacies — we handle the tech, you handle the profits.
          </p>
          
          <div className="mt-10 flex flex-wrap gap-4">
            <Button
              asChild
              size="lg"
              className="h-12 px-8 text-base shadow-lg hover:shadow-primary/25 transition-all"
              onMouseEnter={prefetchSignup}
              onFocus={prefetchSignup}
            >
              <Link to="/signup">
                Start 14-Day Free Trial
                <ArrowRight className="ml-2 size-5" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="h-12 px-8 text-base">
              <Link to="/templates">Explore Templates</Link>
            </Button>
          </div>

          {/* Inline hero email capture */}
          <div className="mt-12 p-1 max-w-md">
            {status === "success" ? (
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400">
                <Check className="size-5 shrink-0" />
                <p className="text-sm font-medium" role="status" aria-live="polite">
                  Playbook sent! Check your inbox.
                </p>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await capture(email, "inline_hero");
                  if (ok) setEmail("");
                }}
                className="relative"
                noValidate
              >
                <label htmlFor={inlineId} className="sr-only">
                  Email address
                </label>
                <div className="flex gap-2">
                  <input
                    id={inlineId}
                    type="email"
                    autoComplete="email"
                    required
                    disabled={pending}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Get our media-buying playbook..."
                    aria-invalid={status === "error"}
                    aria-describedby={status === "error" ? `${inlineId}-err` : undefined}
                    className="flex-1 h-12 rounded-lg border border-input bg-background/50 backdrop-blur-sm px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm disabled:opacity-60 transition-all"
                  />
                  <Button type="submit" variant="default" className="h-12 px-6 rounded-lg" disabled={pending}>
                    {pending ? <Loader2 className="size-5 animate-spin" /> : "Send"}
                  </Button>
                </div>
                {status === "error" && error && (
                  <p
                    id={`${inlineId}-err`}
                    role="alert"
                    className="absolute -bottom-6 left-1 text-xs font-medium text-destructive"
                  >
                    {error}
                  </p>
                )}
              </form>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-muted-foreground/80">
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-primary" /> No credit card required
            </span>
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-primary" /> Fully isolated databases
            </span>
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-primary" /> Local EGP payments
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Logos strip ─────────────────────── */
function LogosStrip() {
  const items: Array<{ name: string; mark: React.ReactNode }> = [
    {
      name: "Nebula Hardware",
      mark: (
        <svg viewBox="0 0 160 30" width="160" height="30" aria-hidden>
          <polygon points="15,5 25,25 5,25" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <text x="35" y="21" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="15" letterSpacing="1.5" fill="currentColor">NEBULA TECH</text>
        </svg>
      ),
    },
    {
      name: "ACE Airsoft",
      mark: (
        <svg viewBox="0 0 140 30" width="140" height="30" aria-hidden>
          <circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="4 2" />
          <circle cx="15" cy="15" r="3" fill="currentColor" />
          <text x="35" y="21" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="16" letterSpacing="2" fill="currentColor">ACE ARENA</text>
        </svg>
      ),
    },
    {
      name: "Eng-Capsule",
      mark: (
        <svg viewBox="0 0 160 30" width="160" height="30" aria-hidden>
          <rect x="5" y="8" width="20" height="14" rx="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="15" y1="8" x2="15" y2="22" stroke="currentColor" strokeWidth="2" />
          <text x="35" y="21" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="15" letterSpacing="0.5" fill="currentColor">ENG-CAPSULE</text>
        </svg>
      ),
    },
    {
      name: "MediPlus",
      mark: (
        <svg viewBox="0 0 120 30" width="120" height="30" aria-hidden>
          <path d="M10 8h6v4h4v6h-4v4h-6v-4H6v-6h4V8z" fill="currentColor" />
          <text x="32" y="21" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="15" letterSpacing="0.5" fill="currentColor">MEDIPLUS</text>
        </svg>
      ),
    },
    {
      name: "Atelier",
      mark: (
        <svg viewBox="0 0 120 30" width="120" height="30" aria-hidden>
          <path d="M5 24 L15 6 L25 24 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <text x="35" y="21" fontFamily="Georgia, serif" fontStyle="italic" fontSize="17" fill="currentColor">Atelier</text>
        </svg>
      ),
    },
  ];
  return (
    <section className="border-b border-border bg-secondary/20">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Powering high-volume brands and niche markets
        </p>
        <div className="mt-8 flex flex-wrap justify-center sm:justify-between gap-8 items-center text-muted-foreground/70">
          {items.map((i) => (
            <div
              key={i.name}
              aria-label={i.name}
              className="flex items-center justify-center hover:text-foreground transition-colors duration-300"
            >
              {i.mark}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── How it works ─────────────────────── */
function HowItWorks() {
  const steps = [
    {
      icon: LayoutTemplate,
      title: "Select your blueprint",
      body: "Choose from battle-tested, conversion-optimized templates built for scale.",
    },
    {
      icon: Upload,
      title: "Sync your catalog",
      body: "Upload products, variants, and pricing instantly through a modern dashboard.",
    },
    {
      icon: MessageCircle,
      title: "Close on WhatsApp",
      body: "Frictionless checkout flow that sends rich order details straight to your phone.",
    },
  ];
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
        <SectionHeader
          eyebrow="The RentWebify Process"
          title="From zero to live in under 10 minutes."
          subtitle="Stop wrestling with plugins and servers. Our managed infrastructure gives you an enterprise-grade storefront instantly."
        />
        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {steps.map((s, idx) => (
            <div
              key={s.title}
              className="group relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex size-12 items-center justify-center rounded-xl border border-border/50 bg-secondary/50 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <s.icon className="size-6" />
                </span>
                <span className="text-sm font-mono font-bold text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors">
                  0{idx + 1}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Sticky CTA (scroll-triggered) ─────────────────────── */
function StickyCTA() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    function onScroll() {
      if (dismissed) return;
      // Triggers after scrolling 1.2x the viewport height
      setVisible(window.scrollY > window.innerHeight * 1.2);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [dismissed]);

  useEffect(() => {
    if (!visible || !linkRef.current) return;
    const el = linkRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          router.preloadRoute({ to: "/signup" }).catch(() => undefined);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, router]);

  if (!visible) return null;
  return (
    <div className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:right-8 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="mx-auto sm:mx-0 max-w-md rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md shadow-2xl p-4 pl-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Launch your platform today.</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            Start the 14-day free trial — no card required.
          </p>
        </div>
        <Button asChild size="sm" className="h-9 px-4 shrink-0 font-medium">
          <Link ref={linkRef} to="/signup">Start Free</Link>
        </Button>
        <button
          aria-label="Dismiss"
          onClick={() => {
            setVisible(false);
            setDismissed(true);
          }}
          className="shrink-0 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── Exit-intent email capture ─────────────────────── */
function ExitIntent() {
  const triggered = useIntentTrigger();
  const [open, setOpen] = useState(false);
  
  useEffect(() => {
    if (triggered) setOpen(true);
  }, [triggered]);

  return (
    <LeadCaptureModal
      open={open}
      onOpenChange={setOpen}
      source="exit_intent"
    />
  );
}

/* ─────────────────────── Shared ─────────────────────── */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-3xl">
      <span className="text-sm font-bold uppercase tracking-widest text-primary">
        {eyebrow}
      </span>
      <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">{subtitle}</p>
      )}
    </div>
  );
}