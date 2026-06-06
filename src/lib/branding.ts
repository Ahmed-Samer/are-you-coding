/**
 * Centralized branding constants. Avoids hardcoding the store domain
 * suffix across the onboarding flow and the dashboard.
 */
export function getRootDomain(): string {
  try {
    // @ts-ignore
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_PLATFORM_ROOT_DOMAIN) {
      // @ts-ignore
      return import.meta.env.VITE_PLATFORM_ROOT_DOMAIN;
    }
  } catch {}
  if (typeof process !== "undefined" && process.env.PLATFORM_ROOT_DOMAIN) {
    return process.env.PLATFORM_ROOT_DOMAIN;
  }
  return "localhost";
}

export const STORE_DOMAIN_SUFFIX = `.${getRootDomain()}`;
export const STORE_CATALOG_CURRENCY = "USD";

export function formatStoreAddress(slug: string): string {
  return `${slug}${STORE_DOMAIN_SUFFIX}`;
}

export function getStorefrontUrl(slug: string): string {
  const root = getRootDomain();
  const isLocalhost = root === "localhost" || root.startsWith("127.0.0.1");
  const port = isLocalhost && typeof window !== "undefined" && window.location.port ? `:${window.location.port}` : "";
  const protocol = isLocalhost ? "http://" : "https://";
  return `${protocol}${slug}.${root}${port}`;
}
