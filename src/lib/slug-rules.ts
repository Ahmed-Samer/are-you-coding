/**
 * Single source of truth for tenant slug validation.
 * Imported by both the client (onboarding wizard) and the server
 * (checkSlugAvailability / createTenantAndSubscription) so the rules can
 * never drift between UI hint, advisory check, and final create.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

// Strict Regex: MUST start with a letter. 
// Middle can be letters, numbers, or hyphens. Ends with letter or number.
export const SLUG_REGEX = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

// Reserved subdomains. 
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "app", "www", "api", "admin", "dashboard", "auth", "login", 
  "signup", "signin", "logout", "onboarding", "checkout", 
  "billing", "pricing", "templates", "template", "about", 
  "contact", "terms", "privacy", "legal", "support", "help", 
  "docs", "blog", "news", "mail", "email", "static", "assets", 
  "cdn", "media", "files", "dev", "preview", "staging", 
  "localhost", "demo", "store", "stores", "shop", "system", 
  "root", "rentwebify"
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