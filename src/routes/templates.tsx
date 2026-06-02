import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useState } from "react";
import { PlatformShell } from "@/components/shells/PlatformShell";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { TEMPLATES as TEMPLATE_REGISTRY, type TemplateDef } from "@/lib/templates";
import { useInView } from "@/hooks/use-in-view";

// Code-split the dialog so its preview UI stays out of the initial bundle.
const TemplatePreviewDialog = lazy(
  () => import("@/components/marketing/TemplatePreviewDialog"),
);

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates — Storefront" },
      {
        name: "description",
        content:
          "Browse premium retail templates. Pick one, customize, and launch your online store in minutes.",
      },
      { property: "og:title", content: "Templates — Storefront" },
      {
        property: "og:description",
        content: "Premium retail templates ready to launch.",
      },
      { property: "og:url", content: "/templates" },
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
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Built for retail. Choose a starting point — you can change colors, copy,
            and layout from your dashboard later.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12">
        {templates.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((t) => (
              <TemplateCard key={t.slug} template={t} onPreview={openPreview} />
            ))}
          </div>
        )}
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
    <article className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <button
        ref={ref}
        type="button"
        onClick={() => onPreview(template.slug)}
        aria-label={`Preview ${template.name} template`}
        className="relative block aspect-[4/3] border-b border-border bg-background cursor-pointer overflow-hidden focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {template.previewImage ? (
          <img
            src={template.previewImage}
            alt={template.previewImageAlt ?? `${template.name} template preview`}
            width={1280}
            height={960}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : inView ? (
          <ComingSoonTile name={template.name} />
        ) : (
          <div className="h-full w-full bg-secondary/30" />
        )}
        {isComingSoon && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/90 border border-border px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
            <Sparkles className="size-3" />
            Coming soon
          </span>
        )}
      </button>
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-semibold">{template.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
        <p className="mt-1 text-xs text-muted-foreground/80">{template.audience}</p>
        {template.comingSoonNote && (
          <p className="mt-2 text-xs text-muted-foreground/80 italic">
            {template.comingSoonNote}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          {isComingSoon ? (
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled
              aria-label={`${template.name} is coming soon`}
              title="This template is coming soon"
            >
              Coming soon
            </Button>
          ) : (
            <Link
              to="/onboarding"
              search={{ template: template.slug }}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Use template
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onPreview(template.slug)}
          >
            Live preview
          </Button>
        </div>
      </div>
    </article>
  );
}

function ComingSoonTile({ name }: { name: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-secondary/30 text-muted-foreground">
      <Sparkles className="size-5" />
      <span className="text-xs uppercase tracking-[0.2em]">Coming soon</span>
      <span className="text-sm text-foreground/80">{name}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
      <Sparkles className="mx-auto size-6 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-semibold">No templates available yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We are crafting new storefront templates. Check back soon — or get in touch
        and tell us what you would like to see.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/contact">Request a template</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/pricing">See pricing</Link>
        </Button>
      </div>
    </div>
  );
}