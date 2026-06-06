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
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-background border-border shadow-2xl">
        {active && (
          <>
            <DialogHeader className="px-8 pt-8 pb-4 border-b border-border/50">
              <DialogTitle aria-live="polite" className="text-2xl font-bold">
                {active.name} <span className="text-muted-foreground font-medium">— Live Preview</span>
              </DialogTitle>
              <DialogDescription className="text-base mt-2">
                This is a realistic preview of the {active.name.toLowerCase()} blueprint. 
                Everything from typography to layout is fully customizable in the RentWebify dashboard.
              </DialogDescription>
            </DialogHeader>
            <div className="p-8 pt-6 bg-secondary/10">
              <div className="relative rounded-xl border border-border overflow-hidden bg-background shadow-lg">
                {/* Updated Browser Chrome to show RentWebify Subdomain */}
                <BrowserChrome host={`${active.slug}.rentwebify.com`} />
                <div className="aspect-[16/10] bg-background relative group">
                  {active.previewImage ? (
                    <img
                      src={active.previewImage}
                      alt={active.previewImageAlt ?? `${active.name} template preview`}
                      width={1280}
                      height={800}
                      className="h-full w-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-[1.02]"
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
                        className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex size-12 items-center justify-center rounded-full bg-background/95 backdrop-blur border border-border shadow-md hover:bg-background hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <ChevronLeft className="size-6 text-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        aria-label="Next template"
                        className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex size-12 items-center justify-center rounded-full bg-background/95 backdrop-blur border border-border shadow-md hover:bg-background hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <ChevronRight className="size-6 text-foreground" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">
                  <span className="text-foreground font-bold">{index + 1}</span> of {templates.length} templates
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="h-11 px-6 font-bold" onClick={() => onChange(null)}>
                    Close Preview
                  </Button>
                  {active.available ? (
                    <Button asChild className="h-11 px-8 font-bold shadow-md">
                      <Link to="/onboarding" search={{ plan: "growth-monthly" }}>
                        Deploy {active.name}
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled className="h-11 px-8 font-bold" aria-label={`${active.name} is coming soon`}>
                      Coming Soon
                    </Button>
                  )}
                </div>
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
    <div className="flex items-center gap-3 border-b border-border bg-secondary/80 px-4 py-2.5">
      <div className="flex gap-1.5">
        <span className="size-3 rounded-full bg-destructive/80" />
        <span className="size-3 rounded-full bg-amber-500/80" />
        <span className="size-3 rounded-full bg-green-500/80" />
      </div>
      <div className="mx-auto flex-1 max-w-md rounded-md bg-background border border-border/50 px-4 py-1 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground shadow-inner">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        {host}
      </div>
    </div>
  );
}

function ComingSoonPlaceholder({ name }: { name: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-secondary/30 text-muted-foreground">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">
        <Sparkles className="size-4" />
        In Development
      </div>
      <p className="text-lg">The <span className="font-bold text-foreground text-xl">{name}</span> engine is being finalized.</p>
      <div className="flex gap-4 opacity-40 mt-2">
        <ShoppingBag className="size-6" />
        <Pill className="size-6" />
        <Stethoscope className="size-6" />
      </div>
    </div>
  );
}