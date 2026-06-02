import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cacheKey, getOrSet, TTL } from "@/lib/storefront-cache.server";

// Public, anon-key Supabase client used ONLY for unauthenticated host/slug
// resolution. We deliberately avoid `supabaseAdmin` here so a missing
// service-role secret never bricks the marketing shell / storefront.
let _anonClient: SupabaseClient<Database> | undefined;
function getAnonClient(): SupabaseClient<Database> {
  if (_anonClient) return _anonClient;
  const url =
    process.env.SUPABASE_URL ??
    (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY for tenant resolver");
  }
  _anonClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anonClient;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

// Public-safe SEO/branding fields surfaced to the storefront SSR head().
// NEVER add owner_id, plan_*, billing_*, stripe_*, mfa_* here — this DTO is
// served to anonymous visitors.
export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  niche: "retail" | "clinic" | "pharmacy";
  status: "pending" | "active" | "suspended";
  theme: { [k: string]: JsonValue };
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  logo_url: string | null;
  accent_color: string | null;
  whatsapp_e164: string | null;
};

export type TenantResolution = {
  tenant: ResolvedTenant | null;
  host: string;
  origin: string;
  isPlatform: boolean;
  // True when the host clearly addresses a storefront (custom domain or
  // `<slug>.<root>` subdomain) but the slug doesn't resolve to an active
  // tenant. The UI shows a dedicated not-found page in this case.
  notFound?: boolean;
  notFoundReason?: "unknown" | "suspended" | "pending";
};

// Hosts that are ALWAYS treated as the platform shell (marketing, dashboard, admin).
// Anything not matching these — and not a verified custom domain — is treated as
// a storefront subdomain `<slug>.<root>`.
const PLATFORM_HOST_PATTERNS: RegExp[] = [
  /^localhost(:\d+)?$/i,
  /^127\.0\.0\.1(:\d+)?$/,
  /^app\./i, // app.<root>
  /^www\./i, // marketing apex alias
];

function isPlatformPreviewHost(host: string): boolean {
  // Sandbox preview hosts (e.g. id-preview--<id>.lovable.app, project--<id>.lovable.app)
  // and the published *.lovable.app fall through to platform unless ?store= override.
  return /\.lovable\.(app|dev|project\.com)$/i.test(host);
}

function getRootDomain(): string | null {
  return process.env.PLATFORM_ROOT_DOMAIN ?? null;
}

function extractSubdomainSlug(host: string): string | null {
  const root = getRootDomain();
  if (!root) return null;
  const hostNoPort = host.split(":")[0]!.toLowerCase();
  const rootLc = root.toLowerCase();
  if (!hostNoPort.endsWith(`.${rootLc}`)) return null;
  const sub = hostNoPort.slice(0, -1 * (rootLc.length + 1));
  if (!sub || sub.includes(".")) return null; // single-label only
  if (sub === "app" || sub === "www") return null; // reserved
  return sub;
}

const TENANT_PUBLIC_COLUMNS =
  "id,slug,name,niche,status,theme,seo_title,seo_description,og_image_url,logo_url,accent_color,whatsapp_e164";

async function lookupBySlug(slug: string): Promise<ResolvedTenant | null> {
  const { value } = await getOrSet(cacheKey.tenantBySlug(slug), TTL.tenantBySlug, async () => {
    const { data, error } = await getAnonClient()
      .from("tenants" as any)
      .select(TENANT_PUBLIC_COLUMNS)
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return (data as ResolvedTenant | null) ?? null;
  });
  return value as ResolvedTenant | null;
}

// Looks up a slug WITHOUT the active filter, so we can distinguish
// "unknown" from "suspended"/"pending" and render the right not-found
// branch. Cached separately to avoid polluting the active-only cache.
async function lookupBySlugAnyStatus(slug: string): Promise<ResolvedTenant | null> {
  const { data, error } = await getAnonClient()
    .from("tenants" as any)
    .select(TENANT_PUBLIC_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as ResolvedTenant | null) ?? null;
}

async function lookupByCustomHost(host: string): Promise<ResolvedTenant | null> {
  const sb = getAnonClient();
  const { data: domain, error: dErr } = await sb
    .from("domains" as any)
    .select("tenant_id")
    .eq("host", host)
    .eq("status", "verified")
    .maybeSingle();
  if (dErr) throw dErr;
  if (!domain) return null;
  const { data: tenant, error: tErr } = await sb
    .from("tenants" as any)
    .select(TENANT_PUBLIC_COLUMNS)
    .eq("id", (domain as any).tenant_id)
    .eq("status", "active")
    .maybeSingle();
  if (tErr) throw tErr;
  return (tenant as ResolvedTenant | null) ?? null;
}

function buildOrigin(req: Request, host: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export const resolveTenant = createServerFn({ method: "GET" }).handler(
  async (): Promise<TenantResolution> => {
    const req = getRequest();
    const url = new URL(req.url);
    const host = (req.headers.get("host") ?? "").toLowerCase();
    const origin = buildOrigin(req, host);

    // Fail-soft: any lookup failure (missing env, RLS surprise, DB outage)
    // degrades to the platform shell instead of throwing a 500. The
    // marketing site / login still renders so users aren't locked out.
    try {
      // Dev/preview override: append ?store=<slug> to view a storefront on a platform host.
      // SECURITY: only honored on localhost or Lovable sandbox/preview hosts. Allowing
      // this on production would let any visitor force tenant-context wiring on the
      // marketing/admin surface by appending ?store=<victim>.
      const storeOverride = url.searchParams.get("store");
      const hostNoPort = host.split(":")[0] ?? "";
      const overrideAllowed =
        /^localhost$/i.test(hostNoPort) ||
        /^127\.0\.0\.1$/.test(hostNoPort) ||
        isPlatformPreviewHost(host);
      if (overrideAllowed && storeOverride && /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(storeOverride)) {
        const tenant = await lookupBySlug(storeOverride);
        if (tenant) {
          return { tenant, host, origin, isPlatform: false };
        }
        // Override was provided but slug doesn't resolve — render not-found
        // so the dev/preview tester sees the same branch a real visitor would.
        const any = await lookupBySlugAnyStatus(storeOverride);
        return {
          tenant: null,
          host,
          origin,
          isPlatform: false,
          notFound: true,
          notFoundReason: !any
            ? "unknown"
            : any.status === "suspended"
              ? "suspended"
              : "pending",
        };
      }

      if (PLATFORM_HOST_PATTERNS.some((re) => re.test(host))) {
        return { tenant: null, host, origin, isPlatform: true };
      }

      // Verified custom domain?
      const byCustom = await lookupByCustomHost(host.split(":")[0]!);
      if (byCustom) {
        return { tenant: byCustom, host, origin, isPlatform: false };
      }

      // Subdomain of the platform root?
      const slug = extractSubdomainSlug(host);
      if (slug) {
        const tenant = await lookupBySlug(slug);
        if (tenant) {
          return { tenant, host, origin, isPlatform: false };
        }
        // Subdomain pattern matched but slug doesn't resolve to an active
        // tenant. Surface a real not-found page (don't degrade silently).
        const any = await lookupBySlugAnyStatus(slug);
        return {
          tenant: null,
          host,
          origin,
          isPlatform: false,
          notFound: true,
          notFoundReason: !any
            ? "unknown"
            : any.status === "suspended"
              ? "suspended"
              : "pending",
        };
      }
    } catch (err) {
      console.error("[resolveTenant] lookup failed; falling back to platform shell", err);
      return { tenant: null, host, origin, isPlatform: true };
    }

    // Sandbox preview without override → platform.
    if (isPlatformPreviewHost(host)) {
      return { tenant: null, host, origin, isPlatform: true };
    }

    // Unknown host → treat as platform (safer default for v1).
    return { tenant: null, host, origin, isPlatform: true };
  },
);
