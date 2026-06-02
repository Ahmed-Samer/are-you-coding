// Canonical, SSR-rendered, deep-linkable product page.
//
// Renders only on the storefront tenant host (NOT on the platform host),
// and 404s when the tenant isn't a storefront. Loads the same cached
// `getStorefrontProduct` payload the in-storefront drawer uses, so there is
// exactly one server-side code path for product detail.
//
// SEO: per-product <title>, description, og:image (cover photo when
// present — omitted when no image), canonical link, twitter:card, plus a
// JSON-LD `Product` block inlined by <ProductDetailView/>.

import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getStorefrontProduct } from "@/lib/catalog.functions";
import { ProductDetailView } from "@/components/storefront/ProductDetailView";
import { CartProvider, useCart } from "@/lib/cart";
import {
  AnnouncementBar,
  StorefrontFooter,
  StorefrontHeader,
} from "@/components/storefront/StorefrontHeader";
import { getAvailability } from "@/lib/availability";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const productQueryOptions = (tenantId: string, productId: string) =>
  queryOptions({
    queryKey: ["storefront-product", tenantId, productId],
    queryFn: () => getStorefrontProduct({ data: { tenantId, productId } }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

export const Route = createFileRoute("/p/$productId")({
  beforeLoad: ({ context, params }) => {
    if (!UUID_RE.test(params.productId)) {
      throw notFound();
    }
    const t = (context as any).tenantResolution as
      | { tenant: { id: string } | null; isPlatform: boolean }
      | undefined;
    if (!t || t.isPlatform || !t.tenant) {
      // Product pages only exist on a storefront host.
      throw notFound();
    }
    return { tenantId: t.tenant.id };
  },
  loader: async ({ context, params }) => {
    const tenantId = (context as any).tenantId as string;
    try {
      const payload = await (context as any).queryClient.ensureQueryData(
        productQueryOptions(tenantId, params.productId),
      );
      const product = (payload as any)?.product ?? null;
      const images = ((payload as any)?.images ?? []) as Array<{ url: string; is_cover?: boolean }>;
      const cover =
        images.find((i) => i.is_cover)?.url ?? images[0]?.url ?? product?.image_url ?? null;
      // Return only serialization-safe head metadata; the component re-reads
      // the full payload via useSuspenseQuery (cache hit, no extra round trip).
      return {
        tenantId,
        meta: product
          ? {
              name: String(product.name ?? ""),
              description: (product.description ?? "") as string,
              cover: cover as string | null,
            }
          : null,
      };
    } catch (e) {
      if ((e as Error)?.message?.toLowerCase().includes("not found")) {
        throw notFound();
      }
      throw e;
    }
  },
  head: ({ loaderData, params }) => {
    const m = loaderData?.meta;
    if (!m) return {};
    const title = m.name;
    const description = (m.description || `Buy ${m.name} online.`).slice(0, 160);
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: m.cover ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    if (m.cover) {
      meta.push({ property: "og:image", content: m.cover });
      meta.push({ name: "twitter:image", content: m.cover });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: `/p/${params.productId}` }],
    };
  },
  component: ProductPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Couldn't load this product</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
        Back to store
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Product not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This product may have been removed or is no longer available.
      </p>
      <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
        Back to store
      </Link>
    </div>
  ),
});

function ProductPage() {
  const router = useRouter();
  const ctx = (router.state.matches[0]?.context ?? {}) as any;
  const tenantResolution = ctx.tenantResolution as
    | {
        tenant: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          accent_color: string | null;
          whatsapp_e164: string | null;
          theme: Record<string, any>;
          seo_description: string | null;
        };
      }
    | undefined;
  const tenant = tenantResolution?.tenant;
  if (!tenant) return null;
  return (
    <CartProvider tenantId={tenant.id}>
      <ProductPageInner tenantId={tenant.id} tenant={tenant} />
    </CartProvider>
  );
}

function ProductPageInner({
  tenantId,
  tenant,
}: {
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    accent_color: string | null;
    whatsapp_e164: string | null;
    theme: Record<string, any>;
    seo_description: string | null;
  };
}) {
  const { productId } = Route.useParams();
  const { data } = useSuspenseQuery(productQueryOptions(tenantId, productId));
  const cart = useCart();
  const theme = (tenant.theme ?? {}) as Record<string, any>;
  const accent: string | null = tenant.accent_color ?? theme.accent_color ?? null;
  const announcement: string | null = theme.announcement ?? null;
  const availability = getAvailability({
    business_hours: theme.business_hours,
    is_accepting_orders: true,
    timezone: theme.timezone,
  } as any);

  const product = (data as any)?.product;
  const images = ((data as any)?.images ?? []) as any[];
  const variants = (data as any)?.variants ?? null;
  const currency = product?.currency ?? "EGP";

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">Product not found</h1>
        <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to store
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      {announcement && <AnnouncementBar text={announcement} accent={accent} />}
      <StorefrontHeader
        tenantName={tenant.name}
        logoUrl={tenant.logo_url}
        accent={accent}
        customDomain={null}
        search=""
        onSearchChange={() => {}}
        cartCount={cart.count}
        onOpenCart={() => {
          // Cart drawer lives on the storefront index route; send shoppers
          // back home with the cart open via a hash flag.
          if (typeof window !== "undefined") window.location.href = "/?cart=1";
        }}
        isOpen={availability.isOpen}
      />
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-8">
        <nav className="mb-6 text-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to store
          </Link>
        </nav>
        <article className="grid gap-8 md:grid-cols-[1fr_1fr]">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
              {product.name}
            </h1>
            <ProductDetailView
              product={product}
              tenantId={tenantId}
              images={images}
              variants={variants}
              currency={currency}
              accent={accent}
              mode="page"
            />
          </div>
        </article>
      </main>
      <StorefrontFooter
        tenantName={tenant.name}
        description={tenant.seo_description || "Quality products, delivered fast."}
        theme={theme}
      />
    </div>
  );
}
