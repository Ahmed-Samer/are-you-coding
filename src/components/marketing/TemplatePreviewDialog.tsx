import { useCallback, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ShoppingBag, Pill, Stethoscope, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TemplateDef } from "@/lib/templates";

type Props = {
  templates: TemplateDef[];
  activeSlug: string | null;
  onChange: (slug: string | null) => void;
};

export default function TemplatePreviewDialog({ templates, activeSlug, onChange }: Props) {
  const index = templates.findIndex((t) => t.slug === activeSlug);
  const active = index >= 0 ? templates[index] : null;

  const goPrev = useCallback(() => {
    if (!templates.length || index < 0) return;
    const next = (index - 1 + templates.length) % templates.length;
    onChange(templates[next].slug);
  }, [templates, index, onChange]);

  const goNext = useCallback(() => {
    if (!templates.length || index < 0) return;
    const next = (index + 1) % templates.length;
    onChange(templates[next].slug);
  }, [templates, index, onChange]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goPrev, goNext]);

  return (
    <Dialog open={!!active} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        {active && (
          <>
            <DialogHeader className="px-6 pt-6">
              <DialogTitle aria-live="polite">{active.name} — live preview</DialogTitle>
              <DialogDescription>
                Realistic preview of the {active.name.toLowerCase()} template.
                Colors, copy, and layout are fully customizable from your dashboard.
              </DialogDescription>
            </DialogHeader>
            <div className="p-6 pt-4">
              <div className="relative rounded-lg border border-border overflow-hidden bg-background">
                <BrowserChrome host={`${active.slug}.storefront.app`} />
                <div className="aspect-[16/10] bg-background relative">
                  {active.previewImage ? (
                    <img
                      src={active.previewImage}
                      alt={active.previewImageAlt ?? `${active.name} template preview`}
                      width={1280}
                      height={800}
                      className="h-full w-full object-cover"
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    <ComingSoonPlaceholder name={active.name} />
                  )}
                  {templates.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={goPrev}
                        aria-label="Previous template"
                        className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex size-9 items-center justify-center rounded-full bg-background/90 border border-border shadow-sm hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        aria-label="Next template"
                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-9 items-center justify-center rounded-full bg-background/90 border border-border shadow-sm hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground text-center">
                {index + 1} of {templates.length} · Use ← / → to navigate
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => onChange(null)}>
                  Close
                </Button>
                {active.available ? (
                  <Button asChild>
                    <Link to="/onboarding" search={{ plan: "growth-monthly" }}>
                      Use {active.name}
                    </Link>
                  </Button>
                ) : (
                  <Button disabled aria-label={`${active.name} is coming soon`}>
                    Coming soon
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BrowserChrome({ host }: { host: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
      <span className="size-2.5 rounded-full bg-border" />
      <span className="size-2.5 rounded-full bg-border" />
      <span className="size-2.5 rounded-full bg-border" />
      <div className="mx-auto rounded-md bg-background border border-border px-3 py-0.5 text-[11px] text-muted-foreground">
        {host}
      </div>
    </div>
  );
}

function ComingSoonPlaceholder({ name }: { name: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-secondary/30 text-muted-foreground">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em]">
        <Sparkles className="size-4" />
        Coming soon
      </div>
      <p className="text-sm">A preview of <span className="font-medium text-foreground">{name}</span> is on the way.</p>
      <div className="flex gap-2 opacity-60">
        <ShoppingBag className="size-4" />
        <Pill className="size-4" />
        <Stethoscope className="size-4" />
      </div>
    </div>
  );
}