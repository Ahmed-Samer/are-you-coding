/**
 * Single source of truth for storefront templates.
 * Used by /templates (marketing) and /onboarding (wizard).
 *
 * --------------------------------------------------------------------------
 * FUTURE MIGRATION PATH — Supabase-backed templates registry
 * --------------------------------------------------------------------------
 * If/when templates become content-managed instead of code-shipped, migrate
 * this static array to a `public.templates` table read at the edge with a
 * short TTL (5–15 min) module cache, mirroring the pattern used by
 * `listPlans` in src/lib/billing.functions.ts.
 *
 * Proposed schema (mirrors TemplateDef below):
 *   create table public.templates (
 *     slug text primary key,
 *     name text not null,
 *     description text not null,
 *     audience text not null,
 *     available boolean not null default true,
 *     coming_soon_note text,
 *     preview_image text,        -- public CDN URL
 *     preview_image_alt text,
 *     og_image text,             -- defaults to preview_image at read time
 *     sort_order int not null default 0,
 *     created_at timestamptz not null default now()
 *   );
 *
 * Grants + RLS (public, anon-readable, server-managed writes):
 *   grant select on public.templates to anon, authenticated;
 *   grant all on public.templates to service_role;
 *   alter table public.templates enable row level security;
 *   create policy "public read templates"
 *     on public.templates for select to anon, authenticated using (true);
 *
 * Only safe, public columns are exposed. Build assets (HTML/CSS bundles per
 * template) stay in code or in a separate storage bucket; this table is the
 * catalog, not the renderer.
 * --------------------------------------------------------------------------
 */

import atelierPreview from "@/assets/templates/atelier.jpg";
import marketPreview from "@/assets/templates/market.jpg";
import boutiquePreview from "@/assets/templates/boutique.jpg";

export type TemplateSlug = "atelier" | "market" | "boutique" | "concierge";

export type TemplateDef = {
  slug: TemplateSlug;
  name: string;
  description: string;
  audience: string;
  available: boolean;
  comingSoonNote?: string;
  previewImage?: string;
  previewImageAlt?: string;
  ogImage?: string;
};

export const TEMPLATES: TemplateDef[] = [
  {
    slug: "atelier",
    name: "Atelier",
    description: "Minimal, editorial retail.",
    audience: "Boutique apparel, design studios",
    available: true,
    previewImage: atelierPreview,
    previewImageAlt: "Atelier template — editorial storefront with serif wordmark and minimal product grid",
    ogImage: atelierPreview,
  },
  {
    slug: "market",
    name: "Market",
    description: "Dense grid for large catalogs.",
    audience: "Grocery, pharmacy, supplies",
    available: true,
    previewImage: marketPreview,
    previewImageAlt: "Market template — dense product grid with category chips for large catalogs",
    ogImage: marketPreview,
  },
  {
    slug: "boutique",
    name: "Boutique",
    description: "Premium feel for small collections.",
    audience: "Jewelry, perfumery, gifting",
    available: true,
    previewImage: boutiquePreview,
    previewImageAlt: "Boutique template — premium product hero with warm tones for small collections",
    ogImage: boutiquePreview,
  },
  {
    slug: "concierge",
    name: "Concierge",
    description: "Booking-first layout for service businesses.",
    audience: "Salons, clinics, studios",
    available: false,
    comingSoonNote: "In design — expected next release.",
  },
];

export function getTemplate(slug: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export function getAvailableTemplates(): TemplateDef[] {
  return TEMPLATES.filter((t) => t.available);
}

/**
 * True only when the slug exists in the registry AND is marked available.
 * Used by both the wizard (gate Continue + confirm revalidation) and the
 * server (createTenantAndSubscription) so a tampered draft can't persist
 * an unavailable template.
 */
export function isTemplateSelectable(slug: string): boolean {
  const t = getTemplate(slug);
  return !!t && t.available;
}

export const TEMPLATE_SLUGS = TEMPLATES.map((t) => t.slug) as [
  TemplateSlug,
  ...TemplateSlug[],
];