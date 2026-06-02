import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { resolveTenant, type TenantResolution } from "@/lib/tenant.functions";
import { TenantContext } from "@/lib/tenant-context";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-semibold tracking-tight text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. Try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  tenantResolution?: TenantResolution;
}>()({
  beforeLoad: async () => {
    const tenantResolution = await resolveTenant();
    return { tenantResolution };
  },
  loader: ({ context }) => ({ tenantResolution: context.tenantResolution }),
  head: ({ loaderData }) => {
    const t = loaderData?.tenantResolution;
    const isStore = !!(t && !t.isPlatform && t.tenant);
    const isStoreNotFound = !!(t && !t.isPlatform && !t.tenant && t.notFound);
    const origin = t?.origin ?? "";

    if (isStore) {
      const tenant = t!.tenant!;
      const title = tenant.seo_title || `${tenant.name} — Online store`;
      const description =
        tenant.seo_description ||
        `Shop ${tenant.name} online. Browse products and order on WhatsApp.`;
      const canonical = origin ? `${origin}/` : "/";
      const ogImage = tenant.og_image_url || tenant.logo_url || null;

      const meta: Array<Record<string, string>> = [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: tenant.name },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ];
      if (tenant.accent_color) meta.push({ name: "theme-color", content: tenant.accent_color });
      if (ogImage) {
        meta.push({ property: "og:image", content: ogImage });
        meta.push({ name: "twitter:image", content: ogImage });
      }

      const ldStore: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Store",
        name: tenant.name,
        url: canonical,
      };
      if (ogImage) ldStore.image = ogImage;
      if (tenant.whatsapp_e164) ldStore.telephone = `+${tenant.whatsapp_e164}`;

      return {
        meta,
        links: [
          { rel: "stylesheet", href: appCss },
          { rel: "canonical", href: canonical },
          { rel: "manifest", href: `/api/public/storefront/${tenant.slug}/manifest` },
        ],
        scripts: [
          {
            type: "application/ld+json",
            children: JSON.stringify(ldStore),
          },
        ],
      };
    }

    if (isStoreNotFound) {
      return {
        meta: [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1" },
          { title: "Store not found" },
          { name: "description", content: "We couldn't find a store at this address." },
          { name: "robots", content: "noindex,nofollow" },
        ],
        links: [{ rel: "stylesheet", href: appCss }],
      };
    }

    // Platform shell defaults.
    const title = "Storefront — Websites for modern retailers";
    const description =
      "Launch a fast, premium online store for your retail business. Pick a template, go live in minutes.";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Storefront" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "stylesheet", href: appCss }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Storefront",
            description:
              "Premium hosted storefront platform for retailers, clinics, and pharmacies.",
            url: "/",
            logo: "/og-image.jpg",
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { tenantResolution } = Route.useLoaderData();
  const value = tenantResolution ?? { tenant: null, host: "", origin: "", isPlatform: true };
  return (
    <QueryClientProvider client={queryClient}>
      <TenantContext.Provider value={value}>
        <AuthProvider>
          <Outlet />
          <Toaster richColors closeButton position="top-right" />
        </AuthProvider>
      </TenantContext.Provider>
    </QueryClientProvider>
  );
}

