// Per-tenant stable opaque session id for the abandoned-cart pipeline.
// Generated lazily, persisted in localStorage forever. Length (UUID v4 = 36)
// satisfies the syncAbandonedCart schema (8–120 chars). SSR-safe: returns
// "" when window is unavailable so callers can skip sync.

const PREFIX = "cart:session:";

export function getCartSessionId(tenantId: string): string {
  if (typeof window === "undefined") return "";
  const key = `${PREFIX}${tenantId}`;
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    // Storage blocked (private mode, quota). Fall back to an in-memory id.
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

/** Overwrite the persisted session id — used after deep-link hydration so
 *  subsequent syncs continue updating the same abandoned_carts row. */
export function setCartSessionId(tenantId: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREFIX}${tenantId}`, sessionId);
  } catch {
    /* noop */
  }
}