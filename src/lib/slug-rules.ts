/**
 * Single source of truth for tenant slug validation.
 * Imported by both the client (onboarding wizard) and the server
 * (checkSlugAvailability / createTenantAndSubscription) so the rules can
 * never drift between UI hint, advisory check, and final create.
 *
 * Rules:
 *   - 3–32 characters
 *   - lowercase a-z, 0-9, hyphens
 *   - cannot start or end with a hyphen
 *   - cannot match any reserved word used by the platform router /
 *     tenant resolver (see src/lib/tenant.functions.ts).
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

// Mirrors the regex used in createTenantAndSubscription.
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

// Reserved subdomains. Keep in sync with PLATFORM_HOST_PATTERNS and the
// short-circuit list in extractSubdomainSlug() in tenant.functions.ts.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "app",
  "www",
  "api",
  "admin",
  "dashboard",
  "auth",
  "login",
  "signup",
  "signin",
  "logout",
  "onboarding",
  "checkout",
  "billing",
  "pricing",
  "templates",
  "template",
  "about",
  "contact",
  "terms",
  "privacy",
  "legal",
  "support",
  "help",
  "docs",
  "blog",
  "news",
  "mail",
  "email",
  "static",
  "assets",
  "cdn",
  "media",
  "files",
  "dev",
  "preview",
  "staging",
  "localhost",
  "test",
  "demo",
  "store",
  "stores",
  "shop",
  "system",
  "root",
  "lovable",
  "coreweb",
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX);
}

export type SlugValidation =
  | { ok: true }
  | { ok: false; reason: "format" | "reserved" };

export function validateSlug(slug: string): SlugValidation {
  if (!SLUG_REGEX.test(slug)) return { ok: false, reason: "format" };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true };
}
