import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState } from "react";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Sparkles, LayoutTemplate } from "lucide-react";
import { TEMPLATES as TEMPLATE_REGISTRY, type TemplateDef } from "@/lib/templates";
import { useInView } from "@/hooks/use-in-view";

const TemplatePreviewDialog = lazy(
  () => import("@/components/marketing/TemplatePreviewDialog"),
);

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates — RentWebify" },
      {
        name: "description",
        content:
          "Browse premium retail and WaaS templates. Pick a blueprint, customize your catalog, and launch in minutes.",
      },
      { property: "og:title", content: "Templates — RentWebify" },
      {
        property: "og:description",
        content: "Enterprise-grade storefront templates ready to deploy.",
      },
      { property: "og:url", content: "https://rentwebify.com/templates" },
      { property: "og:image", content: "/og-image.jpg" },
    ],
    links: [{ rel: "canonical", href: "/templates" }],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const templates = TEMPLATE_REGISTRY;
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const openPreview = useCallback((slug: string) => setActiveSlug(slug), []);
  const closePreview = useCallback(() => setActiveSlug(null), []);

  return (
    <PlatformShell>
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary mb-6">
            <LayoutTemplate className="size-4" />
            Conversion-Optimized
          </span>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground">
            Start with a solid blueprint.
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed">
            Every template is engineered for speed and designed to handle massive ad traffic. Pick your starting point, then customize it directly from your RentWebify dashboard.
          </p>
        </div>
      </section>

      <section className="bg-secondary/10 border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-16">
          {templates.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {templates.map((t) => (
                <TemplateCard key={t.slug} template={t} onPreview={openPreview} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Suspense fallback={null}>
        <TemplatePreviewDialog
          templates={templates}
          activeSlug={activeSlug}
          onChange={(slug) => (slug ? setActiveSlug(slug) : closePreview())}
        />
      </Suspense>
    </PlatformShell>
  );
}

function TemplateCard({
  template,
  onPreview,
}: {
  template: TemplateDef;
  onPreview: (slug: string) => void;
}) {
  const { ref, inView } = useInView<HTMLButtonElement>({ rootMargin: "300px" });
  const isComingSoon = !template.available;

  return (
    <article className="rounded-2xl border border-border/50 bg-card overflow-hidden flex flex-col shadow-sm hover:shadow-lg transition-all duration-300 group">
      <button
        ref={ref}
        type="button"
        onClick={() => onPreview(template.slug)}
        aria-label={`Preview ${template.name} template`}
        className="relative block aspect-[4/3] border-b border-border/50 bg-secondary/20 cursor-pointer overflow-hidden focus:outline-none"
      >
        {template.previewImage ? (
          <img
            src={template.previewImage}
            alt={template.previewImageAlt ?? `${template.name} template preview`}
            width={1280}
            height={960}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : inView ? (
          <ComingSoonTile name={template.name} />
        ) : (
          <div className="h-full w-full bg-secondary/30" />
        )}
        {isComingSoon && (
          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-background/95 backdrop-blur border border-border px-3 py-1 text-xs font-bold text-foreground shadow-sm">
            <Sparkles className="size-3 text-primary" />
            Coming Soon
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
      </button>
      <div className="p-6 flex-1 flex flex-col bg-background">
        <h3 className="text-xl font-bold text-foreground">{template.name}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">{template.description}</p>
        
        <div className="mt-4 pb-4 border-b border-border/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Best For</p>
          <p className="text-sm font-medium text-foreground">{template.audience}</p>
        </div>

        {template.comingSoonNote && (
          <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
            {template.comingSoonNote}
          </p>
        )}
        
        <div className="mt-5 flex gap-3">
          {isComingSoon ? (
            <Button
              type="button"
              className="flex-1 font-bold bg-secondary text-muted-foreground hover:bg-secondary"
              disabled
            >
              Coming Soon
            </Button>
          ) : (
            <Link
              to="/onboarding"
              search={{ template: template.slug }}
              className="flex-1 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              Deploy Now
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4 font-bold border-border/60 hover:bg-secondary"
            onClick={() => onPreview(template.slug)}
          >
            Live Preview
          </Button>
        </div>
      </div>
    </article>
  );
}

function ComingSoonTile({ name }: { name: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-secondary/30 text-muted-foreground">
      <Sparkles className="size-6 opacity-50" />
      <span className="text-xs font-bold uppercase tracking-[0.2em]">In Development</span>
      <span className="text-base font-medium text-foreground/80">{name} Engine</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-16 text-center max-w-2xl mx-auto">
      <Sparkles className="mx-auto size-10 text-primary mb-6" />
      <h2 className="text-2xl font-bold">No templates found</h2>
      <p className="mt-3 text-base text-muted-foreground leading-relaxed">
        We are actively engineering new high-conversion storefront templates. Check back soon or request a custom integration for your brand.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Button asChild variant="outline" className="h-11 px-6 font-bold">
          <Link to="/contact">Request Template</Link>
        </Button>
        <Button asChild className="h-11 px-6 font-bold">
          <Link to="/pricing">View Pricing</Link>
        </Button>
      </div>
    </div>
  );
}