// Worker-isolate in-memory cache for public storefront reads.
//
// Cloudflare Workers reuse an isolate for many requests in the same colo, so
// even a 60–120s TTL gives a meaningful hit rate without persisting stale data
// across deploys. This cache is intentionally per-isolate: there is no global
// coherence, and a missed invalidation self-heals at TTL.
//
// Cache families (see plan):
//   sf:catalog:<tenantId>            — full storefront payload, 60s
//   sf:product:<tenantId>:<productId> — product detail, 120s
//   sf:category:<tenantId>:<slug>    — category page, 120s
//   sf:tenant-by-slug:<slug>         — slug→tenant resolution, 60s
//
// Invalidation: every tenant-scoped write calls `invalidateTenant(tenantId)`
// which clears all `sf:*` keys associated with that tenant, including the
// reverse `sf:tenant-by-slug:*` entry whose cached value points to it.

type Entry<T = unknown> = { value: T; expiresAt: number };

const MAX_ENTRIES = 200;
const store = new Map<string, Entry>();

function touch(key: string, entry: Entry): void {
  // LRU: re-insert to move to the most-recently-used end.
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const now = Date.now();
  const cached = store.get(key) as Entry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    touch(key, cached);
    return { value: cached.value, hit: true };
  }
  const value = await loader();
  touch(key, { value, expiresAt: now + ttlMs });
  return { value, hit: false };
}

export function invalidateKey(key: string): void {
  store.delete(key);
}

/**
 * Clear all cached entries belonging to a tenant — including the slug→tenant
 * reverse map. Called by every mutation path in `catalog.functions.ts`.
 */
export function invalidateTenant(tenantId: string): void {
  for (const [key, entry] of [...store.entries()]) {
    if (key.includes(`:${tenantId}`)) {
      store.delete(key);
      continue;
    }
    if (key.startsWith("sf:tenant-by-slug:")) {
      const v = entry.value as { id?: string } | null;
      if (v && v.id === tenantId) store.delete(key);
    }
  }
}

export function invalidateSlug(slug: string): void {
  store.delete(`sf:tenant-by-slug:${slug}`);
}

export const TTL = {
  catalog: 60_000,
  product: 120_000,
  category: 120_000,
  tenantBySlug: 60_000,
} as const;

export const cacheKey = {
  catalog: (tenantId: string) => `sf:catalog:${tenantId}`,
  product: (tenantId: string, productId: string) => `sf:product:${tenantId}:${productId}`,
  category: (tenantId: string, slug: string) => `sf:category:${tenantId}:${slug}`,
  tenantBySlug: (slug: string) => `sf:tenant-by-slug:${slug}`,
};

// Debug: number of live entries. Used by `X-Cache-Size` header in dev.
export function size(): number {
  return store.size;
}
