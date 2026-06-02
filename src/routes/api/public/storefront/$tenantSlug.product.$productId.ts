// Public read-only product detail with edge caching + ETag.
//
// GET /api/public/storefront/<slug>/product/<productId>

import { createFileRoute } from "@tanstack/react-router";
import { loadStorefrontProductCached, loadTenantBySlugCached } from "@/lib/storefront-loaders.server";
import { CacheControl, jsonWithCaching } from "@/lib/etag.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/storefront/$tenantSlug/product/$productId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = String(params.tenantSlug ?? "").toLowerCase();
        const productId = String(params.productId ?? "");
        if (!/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(slug)) {
          return new Response("Invalid slug", { status: 400 });
        }
        if (!UUID_RE.test(productId)) {
          return new Response("Invalid product id", { status: 400 });
        }
        const { value: tenant } = await loadTenantBySlugCached(slug);
        if (!tenant) return new Response("Not found", { status: 404 });
        try {
          const { value: payload, hit } = await loadStorefrontProductCached(tenant.id, productId);
          return jsonWithCaching({
            payload,
            request,
            cacheControl: CacheControl.product,
            extraHeaders: { "X-Cache": hit ? "HIT" : "MISS" },
          });
        } catch (e) {
          if ((e as Error)?.message === "Product not found") {
            return new Response("Not found", { status: 404 });
          }
          throw e;
        }
      },
    },
  },
});
