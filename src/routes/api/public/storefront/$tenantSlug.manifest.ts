// Per-tenant PWA manifest. Served from a cacheable public route so crawlers
// and installers reliably pick it up (vs. a client-generated Blob URL, which
// is invisible to non-JS consumers).
//
// GET /api/public/storefront/<slug>/manifest
//   → 200 application/manifest+json   { name, short_name, theme_color, icons }
//   → 304 when If-None-Match matches
//   → 404 when slug doesn't resolve to an active tenant

import { createFileRoute } from "@tanstack/react-router";
import { loadTenantBySlugCached } from "@/lib/storefront-loaders.server";
import { CacheControl, etagFor } from "@/lib/etag.server";

export const Route = createFileRoute("/api/public/storefront/$tenantSlug/manifest")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = String(params.tenantSlug ?? "").toLowerCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(slug)) {
          return new Response("Invalid slug", { status: 400 });
        }
        const { value: tenant } = await loadTenantBySlugCached(slug);
        if (!tenant) return new Response("Not found", { status: 404 });

        const t = tenant as Record<string, unknown>;
        const accent =
          (typeof t.accent_color === "string" && (t.accent_color as string)) ||
          "#0a0a0a";
        const logoUrl = typeof t.logo_url === "string" ? (t.logo_url as string) : null;

        const manifest = {
          name: String(t.name ?? slug),
          short_name: String(t.name ?? slug).slice(0, 12),
          start_url: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: accent,
          icons: logoUrl
            ? [{ src: logoUrl, sizes: "any", type: "image/png", purpose: "any" }]
            : [],
        };

        const body = JSON.stringify(manifest);
        const etag = etagFor(body);
        const ifNoneMatch = request.headers.get("if-none-match");
        const headers: Record<string, string> = {
          "Cache-Control": CacheControl.manifest,
          ETag: etag,
          Vary: "Accept-Encoding",
        };
        if (ifNoneMatch && ifNoneMatch === etag) {
          return new Response(null, { status: 304, headers });
        }
        headers["Content-Type"] = "application/manifest+json; charset=utf-8";
        return new Response(body, { status: 200, headers });
      },
    },
  },
});
