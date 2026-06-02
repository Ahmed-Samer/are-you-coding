// Public read-only category page with edge caching + ETag.
//
// GET /api/public/storefront/<slug>/category/<categorySlug>

import { createFileRoute } from "@tanstack/react-router";
import { loadStorefrontCategoryCached, loadTenantBySlugCached } from "@/lib/storefront-loaders.server";
import { CacheControl, jsonWithCaching } from "@/lib/etag.server";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

export const Route = createFileRoute("/api/public/storefront/$tenantSlug/category/$categorySlug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = String(params.tenantSlug ?? "").toLowerCase();
        const categorySlug = String(params.categorySlug ?? "").toLowerCase();
        if (!SLUG_RE.test(slug) || !SLUG_RE.test(categorySlug)) {
          return new Response("Invalid slug", { status: 400 });
        }
        const { value: tenant } = await loadTenantBySlugCached(slug);
        if (!tenant) return new Response("Not found", { status: 404 });
        try {
          const { value: payload, hit } = await loadStorefrontCategoryCached(tenant.id, categorySlug);
          return jsonWithCaching({
            payload,
            request,
            cacheControl: CacheControl.category,
            extraHeaders: { "X-Cache": hit ? "HIT" : "MISS" },
          });
        } catch (e) {
          if ((e as Error)?.message === "Category not found") {
            return new Response("Not found", { status: 404 });
          }
          throw e;
        }
      },
    },
  },
});
