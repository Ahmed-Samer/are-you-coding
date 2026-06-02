// Lightweight ETag + conditional response helper for public read endpoints.
//
// Used by the `/api/public/storefront/*` routes so the edge can serve `304 Not
// Modified` cheaply and browsers/CDNs can cache via `Cache-Control`.

import { createHash } from "crypto";

export function etagFor(payload: unknown): string {
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  const digest = createHash("sha1").update(json).digest("hex");
  // Weak validator — the body is identical, but we don't guarantee byte-stable JSON.
  return `W/"${digest}"`;
}

export function jsonWithCaching(opts: {
  payload: unknown;
  request: Request;
  cacheControl: string;
  extraHeaders?: Record<string, string>;
}): Response {
  const body = JSON.stringify(opts.payload);
  const etag = etagFor(body);
  const ifNoneMatch = opts.request.headers.get("if-none-match");

  const headers: Record<string, string> = {
    "Cache-Control": opts.cacheControl,
    ETag: etag,
    Vary: "Accept-Encoding",
    ...(opts.extraHeaders ?? {}),
  };

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers });
  }

  headers["Content-Type"] = "application/json; charset=utf-8";
  return new Response(body, { status: 200, headers });
}

// Cache-Control presets (mirrors the strategy section of `docs/perf-baseline.md`).
export const CacheControl = {
  // 60s edge / 5min stale-while-revalidate. Catalog changes only on admin edits;
  // bursts of public traffic should mostly hit the edge.
  catalog: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  // Products + categories change less often than the aggregate catalog.
  product: "public, max-age=0, s-maxage=120, stale-while-revalidate=600",
  category: "public, max-age=0, s-maxage=120, stale-while-revalidate=600",
  // Per-tenant PWA manifest. Browser caches for 5 min; CDN holds for a day,
  // serves stale for a week — manifest content rarely changes (name, theme).
  manifest: "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
} as const;
