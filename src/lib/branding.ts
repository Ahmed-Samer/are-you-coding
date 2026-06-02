/**
 * Centralized branding constants. Avoids hardcoding the store domain
 * suffix across the onboarding flow and the dashboard.
 */
export const STORE_DOMAIN_SUFFIX = ".coreweb.app";
export const STORE_CATALOG_CURRENCY = "USD";

export function formatStoreAddress(slug: string): string {
  return `${slug}${STORE_DOMAIN_SUFFIX}`;
}
