/**
 * Single source of truth for storefront templates.
 * Used by /templates (marketing) and /onboarding (wizard).
 */

import classicPreview from "@/assets/templates/atelier.jpg"; // Using existing image as mockup for Classic

export type TemplateSlug = "classic" | "minimal" | "boutique" | "market" | "luxe" | "sport";

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
    slug: "classic",
    name: "Classic",
    description: "The essential Generic Storefront for retail and marketplaces. Fast, flexible, and conversion-optimized.",
    audience: "Retail, E-commerce, Marketplaces",
    available: true,
    previewImage: classicPreview,
    previewImageAlt: "Classic template — the essential high-performance storefront",
    ogImage: classicPreview,
  },
  {
    slug: "minimal",
    name: "Minimal",
    description: "Clean, distraction-free design focusing entirely on your products with generous whitespace.",
    audience: "Artisans, Single-product stores, Tech gadgets",
    available: true,
  },
  {
    slug: "boutique",
    name: "Boutique",
    description: "Elegant serif typography and refined spacing, perfect for high-end fashion and lifestyle brands.",
    audience: "Fashion, Jewelry, Beauty, Lifestyle",
    available: true,
  },
  {
    slug: "market",
    name: "Market",
    description: "Dense, structured grid layout designed to handle large product catalogs and complex categories.",
    audience: "Wholesale, Groceries, Electronics, Large Catalogs",
    available: true,
  },
  {
    slug: "luxe",
    name: "Luxe",
    description: "A dark-mode focused, premium aesthetic that screams luxury and exclusivity.",
    audience: "Luxury watches, High-end fashion, Premium services",
    available: true,
  },
  {
    slug: "sport",
    name: "Sport",
    description: "Bold typography, dynamic angles, and high contrast designed to drive action and energy.",
    audience: "Fitness, Streetwear, Supplements, Action Sports",
    available: true,
  }
];

export function getTemplate(slug: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export function getAvailableTemplates(): TemplateDef[] {
  return TEMPLATES.filter((t) => t.available);
}

export function isTemplateSelectable(slug: string): boolean {
  const t = getTemplate(slug);
  return !!t && t.available;
}

export const TEMPLATE_SLUGS = TEMPLATES.map((t) => t.slug) as [
  TemplateSlug,
  ...TemplateSlug[],
];