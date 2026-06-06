import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useTenant } from "@/lib/tenant-context";
import { Storefront } from "@/components/storefront/Storefront";
import { LandingPage } from "@/components/marketing/LandingPage";
import { StoreNotFound } from "@/components/storefront/StoreNotFound";

// `?product=<uuid>` deep-links the product detail drawer open. Validated
// here so the storefront can read it via Route.useSearch() without a
// per-render regex. Any malformed value silently strips out (the drawer
// stays closed) rather than throwing — defensive UX for shared links.
// `?product=<uuid>` deep-links the product detail drawer open.
// `?cart=open`     deep-links the cart drawer open. Single source of truth
// so both drawers are shareable, browser-back-closable, SSR-stable, and
// survive reloads. Malformed values silently strip out — defensive UX for
// shared links.
const searchSchema = z.object({
  product: z.string().uuid().optional().catch(undefined),
  cart: z.literal("open").optional().catch(undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(searchSchema),
  component: Index,
});

function Index() {
  const { tenant, isPlatform, notFound, notFoundReason, host } = useTenant();
  if (!isPlatform && tenant) {
    return <Storefront tenant={tenant} />;
  }
  if (!isPlatform && notFound) {
    return <StoreNotFound reason={notFoundReason ?? "unknown"} host={host} />;
  }
  return <LandingPage />;
}
