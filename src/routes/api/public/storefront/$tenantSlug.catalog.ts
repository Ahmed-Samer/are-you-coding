// Public read-only storefront catalog. Cached at the edge and in-isolate.
//
// GET /api/public/storefront/<slug>/catalog
//   → 200 { tenant, categories, products, productImages, variants } (JSON)
//   → 304 when `If-None-Match` matches the current ETag
//   → 404 when slug doesn't resolve to an active tenant

import { createFileRoute } from "@tanstack/react-router";
import { loadStorefrontCached, loadTenantBySlugCached } from "@/lib/storefront-loaders.server";
import { CacheControl, jsonWithCaching } from "@/lib/etag.server";

export const Route = createFileRoute("/api/public/storefront/$tenantSlug/catalog")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = String(params.tenantSlug ?? "").toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(slug)) {
          return new Response("Invalid slug", { status: 400 });
        }
        const { value: tenant, hit: tenantHit } = await loadTenantBySlugCached(slug);
        if (!tenant) return new Response("Not found", { status: 404 });
        const { value: payload, hit } = await loadStorefrontCached(tenant.id);
        return jsonWithCaching({
          payload,
          request,
          cacheControl: CacheControl.catalog,
          extraHeaders: { "X-Cache": hit && tenantHit ? "HIT" : "MISS" },
        });
      },
    },
  },
});
