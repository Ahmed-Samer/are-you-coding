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
            className="min-h-[720px] sm:min-h-[900px]"
            aria-hidden
          />
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
    <section className="relative border-b border-border bg-background min-h-[640px] sm:min-h-[720px]">
      <div
        className="absolute inset-0 -z-10"
        style={{
          opacity: reduced ? 0.2 : 0.35,
          backgroundImage:
            "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at top, black 40%, transparent 75%)",
        }}
        aria-hidden
      />
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="max-w-3xl">
          <Badge
            variant="outline"
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
            New — Retail templates now live
          </Badge>
          <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight text-foreground leading-[1.05]">
            Launch your e-commerce or booking site in&nbsp;minutes.
            <span className="block text-muted-foreground">Zero code.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Instant setups for Retail, Clinics, and Pharmacies with built-in
            WhatsApp ordering. We handle the hosting — you handle the sales.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="h-11 px-6"
              onMouseEnter={prefetchSignup}
              onFocus={prefetchSignup}
            >
              <Link to="/signup">
                Start free trial
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-6">
              <Link to="/templates">View templates</Link>
            </Button>
          </div>

          {/* Inline hero email capture */}
          {status === "success" ? (
            <p
              className="mt-6 text-sm text-foreground"
              role="status"
              aria-live="polite"
            >
              Thanks — the playbook is on its way to your inbox.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await capture(email, "inline_hero");
                if (ok) setEmail("");
              }}
              className="mt-6 max-w-md"
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
                  placeholder="Email me the launch playbook"
                  aria-invalid={status === "error"}
                  aria-describedby={status === "error" ? `${inlineId}-err` : undefined}
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                />
                <Button type="submit" variant="secondary" className="h-10" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
                </Button>
              </div>
              {status === "error" && error && (
                <p
                  id={`${inlineId}-err`}
                  role="alert"
                  className="mt-2 text-xs text-destructive"
                >
                  {error}
                </p>
              )}
            </form>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5" /> No credit card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5" /> 14-day free trial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5" /> Local EGP payments
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Logos strip ─────────────────────── */
function LogosStrip() {
  // Tastefully styled brand marks (inline SVG, no remote assets, no CLS).
  const items: Array<{ name: string; mark: React.ReactNode }> = [
    {
      name: "Retail Co.",
      mark: (
        <svg viewBox="0 0 120 24" width="120" height="24" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="currentColor" />
          <text x="26" y="17" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="13" letterSpacing="1" fill="currentColor">RETAIL.CO</text>
        </svg>
      ),
    },
    {
      name: "MediPlus",
      mark: (
        <svg viewBox="0 0 120 24" width="120" height="24" aria-hidden>
          <path d="M8 4h8v6h6v8h-6v6H8v-6H2v-8h6z" fill="currentColor" />
          <text x="28" y="17" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="13" letterSpacing="0.5" fill="currentColor">MEDIPLUS</text>
        </svg>
      ),
    },
    {
      name: "Pharma1",
      mark: (
        <svg viewBox="0 0 120 24" width="120" height="24" aria-hidden>
          <rect x="2" y="6" width="20" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="2" />
          <text x="28" y="17" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="13" letterSpacing="1" fill="currentColor">PHARMA1</text>
        </svg>
      ),
    },
    {
      name: "Atelier",
      mark: (
        <svg viewBox="0 0 120 24" width="120" height="24" aria-hidden>
          <path d="M4 20 L12 4 L20 20 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <text x="28" y="17" fontFamily="Georgia, serif" fontStyle="italic" fontSize="14" fill="currentColor">Atelier</text>
        </svg>
      ),
    },
    {
      name: "Boutique",
      mark: (
        <svg viewBox="0 0 120 24" width="120" height="24" aria-hidden>
          <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 6 V3 H16 V6" fill="none" stroke="currentColor" strokeWidth="2" />
          <text x="28" y="17" fontFamily="system-ui, sans-serif" fontWeight="500" fontSize="13" letterSpacing="2" fill="currentColor">BOUTIQUE</text>
        </svg>
      ),
    },
  ];
  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-center text-xs uppercase tracking-wider text-muted-foreground">
          Trusted by growing businesses across the region
        </p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-6 items-center text-muted-foreground/80">
          {items.map((i) => (
            <div
              key={i.name}
              aria-label={i.name}
              className="flex items-center justify-center"
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
      title: "Choose a template",
      body: "Pick a polished, conversion-ready template tailored to your niche.",
    },
    {
      icon: Upload,
      title: "Upload your content",
      body: "Add your products, prices, and images from a clean dashboard.",
    },
    {
      icon: MessageCircle,
      title: "Receive orders on WhatsApp",
      body: "Customers check out with one tap — orders arrive on your phone.",
    },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow="How it works"
          title="From zero to live in three steps."
          subtitle="No engineers, no plugins, no maintenance. Just a clean process built for operators."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {steps.map((s, idx) => (
            <div
              key={s.title}
              className="relative rounded-xl border border-border bg-card p-6"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-secondary">
                  <s.icon className="size-5" />
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  0{idx + 1}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
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
      // Viewport-relative threshold (~1.5 viewports of scroll).
      setVisible(window.scrollY > window.innerHeight * 1.5);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [dismissed]);

  // Prefetch signup route when the sticky CTA enters the viewport.
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
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 z-40">
      <div className="mx-auto sm:mx-0 max-w-md rounded-xl border border-border bg-background/95 backdrop-blur shadow-lg p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Ready in minutes.</p>
          <p className="text-xs text-muted-foreground truncate">
            Start your 14-day free trial — no card required.
          </p>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0">
          <Link ref={linkRef} to="/signup">Start free</Link>
        </Button>
        <button
          aria-label="Dismiss"
          onClick={() => {
            setVisible(false);
            setDismissed(true);
          }}
          className="shrink-0 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
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
    <div className="max-w-2xl">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-muted-foreground leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
