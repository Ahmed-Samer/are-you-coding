// Server-only loaders for the public storefront. Shared between:
//   - `createServerFn` wrappers in `catalog.functions.ts` (called by the
//     storefront UI as RPC POSTs).
//   - HTTP routes under `src/routes/api/public/storefront/*` (called by edge
//     CDN consumers with `Cache-Control` + `ETag`).
//
// Each loader is wrapped in the worker-isolate cache so repeated hits within
// the TTL skip the DB round-trip entirely.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { withTiming } from "@/lib/perf.server";
import { cacheKey, getOrSet, TTL } from "@/lib/storefront-cache.server";

const sb = supabaseAdmin as any;

// ----- Tenant resolution (slug → tenant DTO) -----

export type TenantBySlug = {
  id: string;
  slug: string;
  name: string;
  niche: "retail" | "clinic" | "pharmacy";
  status: "pending" | "active" | "suspended";
  theme: Record<string, unknown>;
} | null;

async function loadTenantBySlugUncached(slug: string): Promise<TenantBySlug> {
  const { data } = await sb
    .from("tenants")
    .select("id, slug, name, niche, status, theme")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  return (data as TenantBySlug) ?? null;
}

export async function loadTenantBySlugCached(slug: string): Promise<{ value: TenantBySlug; hit: boolean }> {
  return getOrSet(cacheKey.tenantBySlug(slug), TTL.tenantBySlug, () => loadTenantBySlugUncached(slug));
}

// ----- Full storefront catalog -----

const loadStorefrontUncached = withTiming("loadStorefront", async (tenantId: string) => {
  const [
    { data: tenant, error: tErr },
    { data: categories, error: cErr },
    { data: productsRaw, error: pErr },
  ] = await Promise.all([
    sb
      .from("tenants")
      .select("id, slug, name, niche, status, whatsapp_e164, theme, logo_url, accent_color, seo_title, seo_description, og_image_url, currency, business_hours, is_accepting_orders, timezone")
      .eq("id", tenantId)
      .eq("status", "active")
      .maybeSingle(),
    sb
      .from("categories")
      .select("id, name, slug, sort_order, cover_image_url, parent_id, path")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    sb
      .from("products")
      .select(`
        id, name, sku, description, price_cents, currency, stock, image_url, category_id, sort_order,
        product_images(id, product_id, url, alt_text, position, is_cover),
        variant_options(id, product_id, name, position,
          variant_option_values(id, option_id, value, position)
        ),
        product_variants(id, product_id, sku, price_cents, stock_quantity, position, is_active,
          product_variant_option_values(variant_id, option_value_id)
        )
      `)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("product_variants.is_active", true)
      .order("sort_order")
      .order("created_at", { ascending: false }),
  ]);
  if (tErr) throw new Error(tErr.message);
  if (cErr) throw new Error(cErr.message);
  if (pErr) throw new Error(pErr.message);
  if (!tenant) throw new Error("Store not available");

  const images: any[] = [];
  const options: any[] = [];
  const values: any[] = [];
  const variants: any[] = [];
  const links: any[] = [];
  const productsOut: any[] = [];

  for (const p of (productsRaw ?? []) as any[]) {
    for (const img of p.product_images ?? []) images.push(img);
    for (const o of p.variant_options ?? []) {
      options.push({ id: o.id, product_id: o.product_id, name: o.name, position: o.position });
      for (const v of o.variant_option_values ?? []) {
        values.push({ id: v.id, option_id: v.option_id, value: v.value, position: v.position });
      }
    }
    const productVariants = (p.product_variants ?? []) as any[];
    for (const v of productVariants) {
      variants.push({
        id: v.id, product_id: v.product_id, sku: v.sku,
        price_cents: v.price_cents, stock_quantity: v.stock_quantity,
        position: v.position, is_active: v.is_active,
      });
      for (const l of v.product_variant_option_values ?? []) {
        links.push({ variant_id: l.variant_id, option_value_id: l.option_value_id });
      }
    }
    const { product_images: _img, variant_options: _opt, product_variants: _var, ...rest } = p;
    productsOut.push({ ...rest, has_variants: productVariants.length > 0 });
  }

  return {
    tenant,
    categories: categories ?? [],
    products: productsOut,
    productImages: images,
    variants: { options, values, variants, links },
  };
});

export async function loadStorefrontCached(tenantId: string) {
  return getOrSet(cacheKey.catalog(tenantId), TTL.catalog, () => loadStorefrontUncached(tenantId));
}

// ----- Single product detail -----

async function loadStorefrontProductUncached(tenantId: string, productId: string) {
  const { data: row, error } = await sb
    .from("products")
    .select(`
      id, name, sku, description, price_cents, currency, stock, image_url, category_id,
      product_images(id, url, alt_text, position, is_cover),
      variant_options(id, name, position,
        variant_option_values(id, option_id, value, position)
      ),
      product_variants(id, sku, price_cents, stock_quantity, position, is_active,
        product_variant_option_values(variant_id, option_value_id)
      )
    `)
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .eq("is_active", true)
    .eq("product_variants.is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Product not found");

  const { product_images, variant_options, product_variants, ...product } = row as any;
  const options: any[] = [];
  const values: any[] = [];
  for (const o of (variant_options ?? []) as any[]) {
    options.push({ id: o.id, name: o.name, position: o.position });
    for (const v of o.variant_option_values ?? []) {
      values.push({ id: v.id, option_id: v.option_id, value: v.value, position: v.position });
    }
  }
  const variants: any[] = [];
  const links: any[] = [];
  for (const v of (product_variants ?? []) as any[]) {
    variants.push({
      id: v.id, sku: v.sku, price_cents: v.price_cents,
      stock_quantity: v.stock_quantity, position: v.position, is_active: v.is_active,
    });
    for (const l of v.product_variant_option_values ?? []) {
      links.push({ variant_id: l.variant_id, option_value_id: l.option_value_id });
    }
  }

  return {
    product,
    images: (product_images ?? []) as any[],
    variants: { options, values, variants, links },
  };
}

export async function loadStorefrontProductCached(tenantId: string, productId: string) {
  return getOrSet(
    cacheKey.product(tenantId, productId),
    TTL.product,
    () => loadStorefrontProductUncached(tenantId, productId),
  );
}

// ----- Single category page -----

async function loadStorefrontCategoryUncached(tenantId: string, categorySlug: string) {
  const { data: category } = await sb
    .from("categories")
    .select("id, name, slug, cover_image_url")
    .eq("tenant_id", tenantId)
    .eq("slug", categorySlug)
    .maybeSingle();
  if (!category) throw new Error("Category not found");
  const { data: products, error } = await sb
    .from("products")
    .select("id, name, sku, description, price_cents, currency, stock, image_url, sort_order")
    .eq("tenant_id", tenantId)
    .eq("category_id", category.id)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return { category, products: products ?? [] };
}

export async function loadStorefrontCategoryCached(tenantId: string, categorySlug: string) {
  return getOrSet(
    cacheKey.category(tenantId, categorySlug),
    TTL.category,
    () => loadStorefrontCategoryUncached(tenantId, categorySlug),
  );
}
