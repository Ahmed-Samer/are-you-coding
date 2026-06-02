import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSameOrigin, enforceRateLimit } from "@/lib/rate-limit.server";
import { isStoreOpen } from "@/lib/availability";
import { withTiming } from "@/lib/perf.server";
import { enqueueWebhookEvent } from "@/lib/webhooks.server";
import { invalidateTenant } from "@/lib/storefront-cache.server";
import {
  loadStorefrontCached,
  loadStorefrontCategoryCached,
  loadStorefrontProductCached,
} from "@/lib/storefront-loaders.server";


// Cast admin client to `any` so we can reference new tables/columns before
// regenerating the typed schema.
const sb = supabaseAdmin as any;

// ----- helpers -----
async function assertOwner(tenantId: string, userId: string) {
  const { data, error } = await sb
    .from("tenants")
    .select("id, owner_id, name, slug, whatsapp_e164")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== userId) throw new Error("Forbidden");
  return data as { id: string; owner_id: string; name: string; slug: string; whatsapp_e164: string | null };
}

// =============== TENANT-SCOPED READS ===============

export const getMyTenantBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ slug: z.string().trim().toLowerCase().min(1).max(60).regex(slugRe) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await sb
      .from("tenants")
      .select("id, slug, name, niche, status, owner_id, whatsapp_e164, logo_url, accent_color, seo_title, seo_description, og_image_url, currency, low_stock_threshold, business_hours, is_accepting_orders, timezone, cart_recovery_enabled, cart_recovery_delay_minutes, cart_recovery_message_template")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t || t.owner_id !== context.userId) throw new Error("Not found");
    return { tenant: t };
  });

export const listMyCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { data: rows, error } = await sb
      .from("categories")
      .select("id, name, slug, sort_order, cover_image_url, parent_id, path, created_at")
      .eq("tenant_id", data.tenantId)
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    return { categories: rows ?? [] };
  });

export const listMyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { data: rows, error } = await sb
      .from("products")
      .select("id, name, sku, description, price_cents, currency, stock, image_url, is_active, sort_order, category_id, created_at, updated_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { products: rows ?? [] };
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    // Narrowed projection: only the columns the orders UI actually renders.
    // `items` is a JSONB column already containing line items, so no N+1.
    const { data: rows, error } = await sb
      .from("orders")
      .select("id, customer_name, customer_phone, customer_address, notes, items, subtotal_cents, currency, status, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { orders: rows ?? [] };
  });

// =============== KPI / STATS ===============

/**
 * Tenant KPIs for the store overview.
 *
 * Unit convention: `revenueWeekCents` is integer **minor units** (cents /
 * piastres), summed from `orders.subtotal_cents`. Always render with
 * `formatPrice(revenueWeekCents, currency)` — never divide by 100 manually,
 * and never multiply: `subtotal_cents` is already cents at write time
 * (`subtotal = sum(priceCents * quantity)`).
 *
 * TODO multi-currency: `currency` is read from the tenant today, but orders
 * carry their own `currency` column. Once tenants can mix currencies we'll
 * need to bucket by order currency before summing.
 */
export const getTenantStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { data: rows, error } = await sb.rpc("get_tenant_stats_aggregated", {
      p_tenant_id: data.tenantId,
    });
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0] ?? {};
    return {
      ordersToday: Number(row.orders_today ?? 0),
      revenueWeekCents: Number(row.revenue_week_cents ?? 0),
      productCount: Number(row.product_count ?? 0),
      orderCount: Number(row.order_count ?? 0),
    };
  });

export const getMyTenantsWithStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id, slug, name, status, niche, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const stats: Record<string, { ordersToday: number; revenueWeekCents: number }> = {};
    for (const t of tenants ?? []) {
      stats[t.id] = { ordersToday: 0, revenueWeekCents: 0 };
    }
    if ((tenants ?? []).length === 0) return { stats };
    const { data: rows, error: rpcErr } = await sb.rpc("get_owner_tenants_stats", {
      p_owner_id: userId,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    for (const r of rows ?? []) {
      stats[r.tenant_id] = {
        ordersToday: Number(r.orders_today ?? 0),
        revenueWeekCents: Number(r.revenue_week_cents ?? 0),
      };
    }
    return { stats };
  });


// =============== CATEGORY WRITES ===============

const slugRe = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(80),
      slug: z.string().trim().toLowerCase().regex(slugRe),
      sortOrder: z.number().int().min(0).max(9999).default(0),
      coverImageUrl: z.string().url().max(500).optional().nullable(),
      parentId: z.string().uuid().optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);

    // Resolve parent path (must belong to same tenant). Guard cycles.
    let parentPath: string | null = null;
    if (data.parentId) {
      if (data.id && data.parentId === data.id) {
        throw new Error("A category cannot be its own parent.");
      }
      const { data: parent } = await sb
        .from("categories")
        .select("id, tenant_id, path")
        .eq("id", data.parentId)
        .maybeSingle();
      if (!parent || parent.tenant_id !== data.tenantId) {
        throw new Error("Parent category not found.");
      }
      if (data.id && typeof parent.path === "string" && parent.path.split("/").includes(data.id)) {
        throw new Error("Cannot move category under its own descendant.");
      }
      parentPath = parent.path ?? parent.id;
    }

    const payload: any = {
      tenant_id: data.tenantId,
      name: data.name,
      slug: data.slug,
      sort_order: data.sortOrder,
      cover_image_url: data.coverImageUrl ?? null,
      parent_id: data.parentId ?? null,
    };

    let categoryId: string;
    if (data.id) {
      const { error } = await sb.from("categories").update(payload).eq("id", data.id).eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
      categoryId = data.id;
    } else {
      const { data: row, error } = await sb.from("categories").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      categoryId = row.id;
    }

    const newPath = parentPath ? `${parentPath}/${categoryId}` : categoryId;
    await sb.from("categories").update({ path: newPath }).eq("id", categoryId).eq("tenant_id", data.tenantId);

    // Single recursive-CTE update for the root + all descendants. Replaces
    // the per-row UPDATE storm the prior in-JS recurse produced.
    const { error: recErr } = await sb.rpc("recompute_category_paths", {
      p_tenant_id: data.tenantId,
      p_root_id: categoryId,
    });
    if (recErr) throw new Error(recErr.message);


    invalidateTenant(data.tenantId);
    return { id: categoryId };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { error } = await sb.from("categories").delete().eq("id", data.id).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    invalidateTenant(data.tenantId);
    return { ok: true };
  });

export const reorderCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      order: z.array(z.string().uuid()).min(1).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    // sequential updates keep it simple and safe
    for (let i = 0; i < data.order.length; i++) {
      const { error } = await sb
        .from("categories")
        .update({ sort_order: i })
        .eq("id", data.order[i])
        .eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
    }
    invalidateTenant(data.tenantId);
    return { ok: true };
  });

// =============== PRODUCT WRITES ===============

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      id: z.string().uuid().optional(),
      categoryId: z.string().uuid().nullable().optional(),
      name: z.string().trim().min(1).max(120),
      sku: z.string().trim().max(60).optional().nullable(),
      description: z.string().trim().max(2000).optional().nullable(),
      priceCents: z.number().int().min(0).max(1_000_000_00),
      currency: z.string().trim().length(3).default("EGP"),
      stock: z.number().int().min(0).max(1_000_000).default(0),
      imageUrl: z.string().url().max(500).optional().nullable(),
      isActive: z.boolean().default(true),
      sortOrder: z.number().int().min(0).max(9999).default(0),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const payload = {
      tenant_id: data.tenantId,
      category_id: data.categoryId ?? null,
      name: data.name,
      sku: data.sku ?? null,
      description: data.description ?? null,
      price_cents: data.priceCents,
      currency: data.currency.toUpperCase(),
      stock: data.stock,
      image_url: data.imageUrl ?? null,
      is_active: data.isActive,
      sort_order: data.sortOrder,
    };
    if (data.id) {
      const { error } = await sb.from("products").update(payload).eq("id", data.id).eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
      invalidateTenant(data.tenantId);
      return { id: data.id };
    }
    const { data: row, error } = await sb.from("products").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    invalidateTenant(data.tenantId);
    return { id: row.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { error } = await sb.from("products").delete().eq("id", data.id).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    invalidateTenant(data.tenantId);
    return { ok: true };
  });

export const bulkProductAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      ids: z.array(z.string().uuid()).min(1).max(500),
      action: z.enum(["delete", "activate", "hide"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    if (data.action === "delete") {
      const { error } = await sb.from("products").delete().in("id", data.ids).eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
    } else {
      const is_active = data.action === "activate";
      const { error } = await sb.from("products").update({ is_active }).in("id", data.ids).eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
    }
    invalidateTenant(data.tenantId);
    return { ok: true, count: data.ids.length };
  });

// =============== ORDER WRITES ===============

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      id: z.string().uuid(),
      status: z.enum(["whatsapp_sent", "confirmed", "fulfilled", "cancelled"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { error } = await sb.from("orders").update({ status: data.status }).eq("id", data.id).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============== TENANT SETTINGS ===============

export const updateTenantSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      whatsappE164: z.string().trim().regex(/^\d{8,15}$/, "Digits only, 8–15").optional().nullable(),
      logoUrl: z.string().url().max(500).optional().nullable(),
      accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
      seoTitle: z.string().trim().max(60).optional().nullable(),
      seoDescription: z.string().trim().max(160).optional().nullable(),
      ogImageUrl: z.string().url().max(500).optional().nullable(),
      currency: z.string().trim().length(3).optional(),
      lowStockThreshold: z.number().int().min(0).max(10000).optional(),
      businessHours: z
        .record(
          z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
          z.object({
            open: z.boolean(),
            ranges: z
              .array(
                z.object({
                  start: z.string().regex(/^\d{1,2}:\d{2}$/),
                  end: z.string().regex(/^\d{1,2}:\d{2}$/),
                }),
              )
              .max(6),
          }),
        )
        .optional()
        .nullable(),
      isAcceptingOrders: z.boolean().optional(),
      timezone: z.string().trim().min(1).max(64).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const patch: any = {};
    if (data.whatsappE164 !== undefined) patch.whatsapp_e164 = data.whatsappE164 ?? null;
    if (data.logoUrl !== undefined) patch.logo_url = data.logoUrl ?? null;
    if (data.accentColor !== undefined) patch.accent_color = data.accentColor ?? null;
    if (data.seoTitle !== undefined) patch.seo_title = data.seoTitle ?? null;
    if (data.seoDescription !== undefined) patch.seo_description = data.seoDescription ?? null;
    if (data.ogImageUrl !== undefined) patch.og_image_url = data.ogImageUrl ?? null;
    if (data.currency !== undefined) patch.currency = data.currency.toUpperCase();
    if (data.lowStockThreshold !== undefined) patch.low_stock_threshold = data.lowStockThreshold;
    if (data.businessHours !== undefined) patch.business_hours = data.businessHours ?? null;
    if (data.isAcceptingOrders !== undefined) patch.is_accepting_orders = data.isAcceptingOrders;
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await sb.from("tenants").update(patch).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    invalidateTenant(data.tenantId);
    return { ok: true };
  });

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      confirmSlug: z.string().trim().toLowerCase().min(1).max(60).regex(slugRe),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const t = await assertOwner(data.tenantId, context.userId);
    if (t.slug !== data.confirmSlug) throw new Error("Confirmation does not match store address.");
    const { error } = await sb.from("tenants").delete().eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============== PUBLIC STOREFRONT ===============

export const getStorefront = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    // Cached in worker memory for 60s. Invalidated by every tenant-scoped
    // write below (see `invalidateTenant` calls).
    const { value } = await loadStorefrontCached(data.tenantId);
    return value;
  });



// =============== ORDER CREATION (storefront) ===============

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  variantLabel: z.string().trim().max(200).optional().nullable(),
  name: z.string().min(1).max(200),
  priceCents: z.number().int().min(0),
  quantity: z.number().int().min(1).max(999),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      customerName: z.string().trim().min(2).max(120),
      customerPhone: z.string().trim().min(5).max(40).regex(/^[+\d][\d\s\-()]{4,39}$/, "Invalid phone"),
      customerAddress: z.string().trim().max(500).optional().nullable(),
      notes: z.string().trim().max(500).optional().nullable(),
      items: z.array(cartItemSchema).min(1).max(100),
      promoCode: z.string().trim().min(1).max(60).optional().nullable(),
      sessionId: z.string().min(8).max(120).optional().nullable(),
      recoveryToken: z.string().min(20).max(120).optional().nullable(),
    }).parse(i),
  )

  .handler(withTiming("createOrder", async ({ data }) => {
    assertSameOrigin();
    // Cap order spam per tenant: 30 orders / hour from the public storefront.
    await enforceRateLimit({
      table: "orders",
      filters: { tenant_id: data.tenantId },
      max: 30,
      windowSec: 60 * 60,
      label: "orders",
    });

    const { data: tenant } = await sb
      .from("tenants").select("id, whatsapp_e164, currency, business_hours, is_accepting_orders, timezone").eq("id", data.tenantId).maybeSingle();
    if (!tenant) throw new Error("Store not available");
    const currency = (tenant as any)?.currency ?? "EGP";

    // Gate orders by store availability (manual pause or out-of-hours).
    if (!isStoreOpen(tenant as any)) {
      throw new Error("This store is currently closed or not accepting orders.");
    }

    // ----- Server-side authoritative item validation -----
    // NEVER trust client-supplied priceCents / name / tenant binding. Re-fetch
    // every product + variant scoped to this tenant, reject anything that
    // doesn't belong, is inactive, or has a mismatched variant linkage.
    const productIds = [...new Set(data.items.map((it) => it.productId))];
    const variantIds = data.items
      .map((it) => it.variantId)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const [{ data: dbProducts, error: pErr }, { data: dbVariants, error: vErr }] = await Promise.all([
      sb
        .from("products")
        .select("id, tenant_id, name, price_cents, image_url, is_active")
        .in("id", productIds)
        .eq("tenant_id", data.tenantId),
      variantIds.length > 0
        ? sb
            .from("product_variants")
            .select("id, product_id, price_cents, is_active")
            .in("id", variantIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (vErr) throw new Error(vErr.message);

    const productById = new Map<string, any>((dbProducts ?? []).map((p: any) => [p.id, p]));
    const variantById = new Map<string, any>((dbVariants ?? []).map((v: any) => [v.id, v]));

    // Build server-authoritative items array (price, name from DB).
    const serverItems = data.items.map((it) => {
      const product = productById.get(it.productId);
      if (!product) throw new Error(`Item unavailable: ${it.name}`);
      if (!product.is_active) throw new Error(`Item unavailable: ${product.name}`);
      let priceCents: number = product.price_cents;
      if (it.variantId) {
        const variant = variantById.get(it.variantId);
        if (!variant || variant.product_id !== it.productId) {
          throw new Error(`Variant unavailable: ${product.name}`);
        }
        if (!variant.is_active) throw new Error(`Variant unavailable: ${product.name}`);
        priceCents = variant.price_cents ?? product.price_cents;
      }
      return {
        productId: it.productId,
        variantId: it.variantId ?? null,
        variantLabel: it.variantLabel ?? null,
        name: product.name,
        priceCents,
        quantity: it.quantity,
        imageUrl: product.image_url ?? null,
      };
    });

    const subtotal = serverItems.reduce((s, it) => s + it.priceCents * it.quantity, 0);

    // ----- Atomic stock decrement via RPC -----
    // Each RPC is a single UPDATE … WHERE stock >= qty RETURNING … so two
    // concurrent orders for the last unit serialize at row-lock level and
    // exactly one wins. On any miss we restore prior decrements before aborting.
    const decremented: Array<
      | { kind: "variant"; variantId: string; qty: number }
      | { kind: "product"; productId: string; qty: number }
    > = [];

    async function restoreAll() {
      for (const d of decremented) {
        try {
          if (d.kind === "variant") {
            await sb.rpc("restore_variant_stock", { p_variant_id: d.variantId, p_qty: d.qty });
          } else {
            await sb.rpc("restore_product_stock", {
              p_product_id: d.productId,
              p_tenant_id: data.tenantId,
              p_qty: d.qty,
            });
          }
        } catch (e) {
          console.error("[createOrder] stock restore failed", e);
        }
      }
    }

    for (const it of serverItems) {
      try {
        if (it.variantId) {
          const { data: newStock, error } = await sb.rpc("decrement_variant_stock", {
            p_variant_id: it.variantId,
            p_qty: it.quantity,
          });
          if (error) throw new Error(error.message);
          if (newStock === null || newStock === undefined) {
            await restoreAll();
            throw new Error(`Out of stock: ${it.name}`);
          }
          decremented.push({ kind: "variant", variantId: it.variantId, qty: it.quantity });
        } else {
          const { data: newStock, error } = await sb.rpc("decrement_product_stock", {
            p_product_id: it.productId,
            p_tenant_id: data.tenantId,
            p_qty: it.quantity,
          });
          if (error) throw new Error(error.message);
          if (newStock === null || newStock === undefined) {
            await restoreAll();
            throw new Error(`Out of stock: ${it.name}`);
          }
          decremented.push({ kind: "product", productId: it.productId, qty: it.quantity });
        }
      } catch (e) {
        await restoreAll();
        throw e;
      }
    }

    // ----- Promo resolution & atomic redemption -----
    let promoRow: any = null;
    let discountCents = 0;
    if (data.promoCode) {
      const v = await resolvePromo(data.tenantId, data.promoCode, subtotal);
      if (v.ok) {
        // Atomically increment the redemption counter under WHERE max_redemptions
        // guard. If it returns false the promo just hit its limit between
        // resolution and redemption — silently drop the discount instead of
        // failing the order.
        const { data: applied } = await sb.rpc("increment_promo_redemption", {
          p_promo_id: v.promo.id,
        });
        if (applied === true) {
          promoRow = v.promo;
          discountCents = v.discountCents;
        }
      }
    }

    // ----- Insert order (now safe: stock reserved, price authoritative) -----
    const { data: row, error } = await sb.from("orders").insert({
      tenant_id: data.tenantId,
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      customer_address: data.customerAddress ?? null,
      notes: data.notes ?? null,
      items: serverItems,
      subtotal_cents: subtotal,
      currency,
      status: "whatsapp_sent",
    }).select("id").single();
    if (error) {
      // Catastrophic — release the reserved stock so it doesn't leak.
      await restoreAll();
      throw new Error(error.message);
    }

    // Record promo redemption (counter already incremented above).
    if (promoRow) {
      try {
        await sb.from("promo_redemptions").insert({
          promo_id: promoRow.id,
          order_id: row.id,
          customer_phone: data.customerPhone,
        });
      } catch (e) {
        console.error("[createOrder] promo redemption insert failed", e);
      }
    }



    // ----- Abandoned-cart attribution (best-effort, never fails the order) ---
    try {
      if (data.recoveryToken || data.sessionId) {
        let cart: any = null;
        if (data.recoveryToken) {
          const { data: byToken } = await sb
            .from("abandoned_carts")
            .select("id, status")
            .eq("tenant_id", data.tenantId)
            .eq("recovery_token", data.recoveryToken)
            .maybeSingle();
          cart = byToken;
        }
        if (!cart && data.sessionId) {
          const { data: bySession } = await sb
            .from("abandoned_carts")
            .select("id, status")
            .eq("tenant_id", data.tenantId)
            .eq("session_id", data.sessionId)
            .maybeSingle();
          cart = bySession;
        }
        if (cart?.id) {
          await sb
            .from("abandoned_carts")
            .update({ status: "converted", recovered_order_id: row.id })
            .eq("id", cart.id);
          const { data: lastAttempt } = await sb
            .from("cart_recovery_attempts")
            .select("id, status")
            .eq("cart_id", cart.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastAttempt && (lastAttempt.status === "clicked" || lastAttempt.status === "sent")) {
            await sb
              .from("cart_recovery_attempts")
              .update({
                status: "converted",
                converted_order_id: row.id,
                converted_amount_cents: subtotal,
              })
              .eq("id", lastAttempt.id);
          }
        }
      }
    } catch (e) {
      console.error("[createOrder] cart attribution failed", e);
    }

    // Fire-and-forget: notify any subscribed webhook endpoints.
    void enqueueWebhookEvent({
      tenantId: data.tenantId,
      eventType: "order.created",
      payload: {
        order_id: row.id,
        tenant_id: data.tenantId,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        items: serverItems,
        subtotal_cents: subtotal,
        discount_cents: discountCents,
        total_cents: Math.max(0, subtotal - discountCents),
        currency,
        promo_code: promoRow?.code ?? null,
        created_at: new Date().toISOString(),
      },
    }).catch((e: unknown) => console.error("[createOrder] webhook enqueue failed", e));

    return {
      orderId: row.id,
      whatsappE164: (tenant as any)?.whatsapp_e164 ?? null,
      subtotalCents: subtotal,
      currency,
      discountCents,
      promoCode: promoRow?.code ?? null,
      totalCents: Math.max(0, subtotal - discountCents),
    };
  }));

// =============== STORAGE: signed upload URLs ===============

async function signTenantUpload(tenantId: string, userId: string, sub: "products" | "branding", filename: string) {
  await assertOwner(tenantId, userId);
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const path = `${tenantId}/${sub}/${Date.now()}-${safe}`;
  const { data, error } = await (supabaseAdmin as any)
    .storage
    .from("tenant-assets")
    .createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, token: data.token, signedUrl: data.signedUrl };
}

export const getProductImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      filename: z.string().trim().min(1).max(120),
    }).parse(i),
  )
  .handler(async ({ data, context }) => signTenantUpload(data.tenantId, context.userId, "products", data.filename));

export const getLogoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      filename: z.string().trim().min(1).max(120),
    }).parse(i),
  )
  .handler(async ({ data, context }) => signTenantUpload(data.tenantId, context.userId, "branding", data.filename));

// =============== PRODUCT IMAGES (gallery) ===============

async function assertOwnerOfProduct(productId: string, userId: string) {
  const { data, error } = await sb
    .from("products")
    .select("id, tenant_id")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Product not found");
  await assertOwner(data.tenant_id, userId);
  return data as { id: string; tenant_id: string };
}

async function syncCoverToProduct(productId: string) {
  const { data: cover } = await sb
    .from("product_images")
    .select("url")
    .eq("product_id", productId)
    .eq("is_cover", true)
    .maybeSingle();
  await sb.from("products").update({ image_url: cover?.url ?? null }).eq("id", productId);
}

export const listProductImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ productId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwnerOfProduct(data.productId, context.userId);
    const { data: rows, error } = await sb
      .from("product_images")
      .select("id, url, alt_text, position, is_cover, created_at")
      .eq("product_id", data.productId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { images: rows ?? [] };
  });

export const addProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      productId: z.string().uuid(),
      url: z.string().url().max(500),
      altText: z.string().trim().max(160).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const owned = await assertOwnerOfProduct(data.productId, context.userId);
    // Place at end of current order.
    const { data: existing } = await sb
      .from("product_images")
      .select("id, position, is_cover")
      .eq("product_id", data.productId);
    const list = (existing ?? []) as Array<{ id: string; position: number; is_cover: boolean }>;
    const nextPos = list.length === 0 ? 0 : Math.max(...list.map((r) => r.position)) + 1;
    const isCover = list.length === 0;
    const { data: row, error } = await sb
      .from("product_images")
      .insert({
        product_id: data.productId,
        url: data.url,
        alt_text: data.altText ?? null,
        position: nextPos,
        is_cover: isCover,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (isCover) await syncCoverToProduct(data.productId);
    invalidateTenant(owned.tenant_id);
    return { id: row.id };
  });

export const updateProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      imageId: z.string().uuid(),
      altText: z.string().trim().max(160).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: img, error: e1 } = await sb
      .from("product_images").select("product_id").eq("id", data.imageId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!img) throw new Error("Image not found");
    const owned = await assertOwnerOfProduct(img.product_id, context.userId);
    const { error } = await sb
      .from("product_images")
      .update({ alt_text: data.altText })
      .eq("id", data.imageId);
    if (error) throw new Error(error.message);
    invalidateTenant(owned.tenant_id);
    return { ok: true };
  });

export const removeProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ imageId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: img, error: e1 } = await sb
      .from("product_images")
      .select("id, product_id, is_cover")
      .eq("id", data.imageId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!img) throw new Error("Image not found");
    const owned = await assertOwnerOfProduct(img.product_id, context.userId);
    const { error } = await sb.from("product_images").delete().eq("id", data.imageId);
    if (error) throw new Error(error.message);
    // If we removed the cover, promote the first remaining image.
    if (img.is_cover) {
      const { data: next } = await sb
        .from("product_images")
        .select("id")
        .eq("product_id", img.product_id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        await sb.from("product_images").update({ is_cover: true }).eq("id", next.id);
      }
      await syncCoverToProduct(img.product_id);
    }
    invalidateTenant(owned.tenant_id);
    return { ok: true };
  });

export const reorderProductImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      productId: z.string().uuid(),
      order: z.array(z.string().uuid()).min(1).max(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const owned = await assertOwnerOfProduct(data.productId, context.userId);
    for (let i = 0; i < data.order.length; i++) {
      const { error } = await sb
        .from("product_images")
        .update({ position: i })
        .eq("id", data.order[i])
        .eq("product_id", data.productId);
      if (error) throw new Error(error.message);
    }
    invalidateTenant(owned.tenant_id);
    return { ok: true };
  });

export const setCoverImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ imageId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: img, error: e1 } = await sb
      .from("product_images").select("id, product_id").eq("id", data.imageId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!img) throw new Error("Image not found");
    const owned = await assertOwnerOfProduct(img.product_id, context.userId);
    // Clear current cover, then mark this one. Partial unique index enforces invariant.
    const { error: clearErr } = await sb
      .from("product_images")
      .update({ is_cover: false })
      .eq("product_id", img.product_id)
      .eq("is_cover", true);
    if (clearErr) throw new Error(clearErr.message);
    const { error } = await sb
      .from("product_images")
      .update({ is_cover: true })
      .eq("id", data.imageId);
    if (error) throw new Error(error.message);
    await syncCoverToProduct(img.product_id);
    invalidateTenant(owned.tenant_id);
    return { ok: true };
  });


// =============== CSV escape helper (used by exportOrdersCsv below) ===============


function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportOrdersCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { data: rows, error } = await sb
      .from("orders")
      .select("id, created_at, customer_name, customer_phone, customer_address, subtotal_cents, currency, status, items, notes")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const header = ["id", "created_at", "customer_name", "customer_phone", "customer_address", "subtotal_cents", "currency", "status", "items_json", "notes"];
    const body = (rows ?? []).map((r: any) =>
      [r.id, r.created_at, r.customer_name, r.customer_phone, r.customer_address, r.subtotal_cents, r.currency, r.status, JSON.stringify(r.items ?? []), r.notes]
        .map(csvEscape)
        .join(","),
    );
    return { csv: [header.join(","), ...body].join("\n"), count: rows?.length ?? 0 };
  });

// =============== RESEND WHATSAPP LINK ===============

export const resendWhatsAppOrderLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid(), orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const t = await assertOwner(data.tenantId, context.userId);
    const { data: order } = await sb
      .from("orders")
      .select("id, customer_name, customer_phone, subtotal_cents, currency, items, notes")
      .eq("id", data.orderId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");
    if (!t.whatsapp_e164) throw new Error("Tenant has no WhatsApp number configured.");

    const items: any[] = Array.isArray(order.items) ? order.items : [];
    const lines = items.map((it) => `• ${it.quantity}× ${it.name}`).join("\n");
    const message = [
      `Hi ${order.customer_name}, here's a copy of your order at ${t.name}:`,
      "",
      lines,
      "",
      `Total: ${(order.subtotal_cents / 100).toFixed(2)} ${order.currency}`,
      order.notes ? `Notes: ${order.notes}` : "",
    ].filter(Boolean).join("\n");

    const url = `https://wa.me/${t.whatsapp_e164}?text=${encodeURIComponent(message)}`;
    return { url };
  });

// =============== STOREFRONT (public, scoped) ===============

export const getStorefrontCategory = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      categorySlug: z.string().trim().toLowerCase().min(1).max(60),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { value } = await loadStorefrontCategoryCached(data.tenantId, data.categorySlug);
    return value;
  });

export const getStorefrontProduct = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      productId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { value } = await loadStorefrontProductCached(data.tenantId, data.productId);
    return value;
  });


export const searchStorefront = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      q: z.string().trim().min(1).max(80),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const term = data.q.replace(/[%_,]/g, " ");
    const { data: products, error } = await sb
      .from("products")
      .select("id, name, sku, price_cents, currency, image_url")
      .eq("tenant_id", data.tenantId)
      .eq("is_active", true)
      .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
      .limit(50);
    if (error) throw new Error(error.message);
    return { products: products ?? [] };
  });

// =============== PRODUCT VARIANTS (Phase A) ===============

export const listVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ productId: z.string().uuid() }).parse(i))
  .handler(withTiming("listVariants", async ({ data, context }) => {
    await assertOwnerOfProduct(data.productId, context.userId);
    const [{ data: options, error: oErr }, { data: variants, error: vErr }] = await Promise.all([
      sb.from("variant_options")
        .select("id, name, position")
        .eq("product_id", data.productId)
        .order("position", { ascending: true }),
      sb.from("product_variants")
        .select("id, sku, price_cents, stock_quantity, position, is_active")
        .eq("product_id", data.productId)
        .order("position", { ascending: true }),
    ]);
    if (oErr) throw new Error(oErr.message);
    if (vErr) throw new Error(vErr.message);

    const optionIds = (options ?? []).map((o: any) => o.id);
    const variantIds = (variants ?? []).map((v: any) => v.id);
    let values: any[] = [];
    let links: any[] = [];
    if (optionIds.length > 0) {
      const { data: vals, error } = await sb
        .from("variant_option_values")
        .select("id, option_id, value, position")
        .in("option_id", optionIds)
        .order("position", { ascending: true });
      if (error) throw new Error(error.message);
      values = vals ?? [];
    }
    if (variantIds.length > 0) {
      const { data: lnk, error } = await sb
        .from("product_variant_option_values")
        .select("variant_id, option_value_id")
        .in("variant_id", variantIds);
      if (error) throw new Error(error.message);
      links = lnk ?? [];
    }
    return { options: options ?? [], values, variants: variants ?? [], links };
  }));

const variantMatrixInput = z.object({
  productId: z.string().uuid(),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        values: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
      }),
    )
    .max(5),
  variants: z
    .array(
      z.object({
        // Combination expressed as parallel option->value names so the server
        // can resolve IDs after upserting options/values.
        combination: z.array(
          z.object({
            optionName: z.string().trim().min(1).max(40),
            value: z.string().trim().min(1).max(60),
          }),
        ),
        sku: z.string().trim().max(60).optional().nullable(),
        priceCents: z.number().int().min(0).max(1_000_000_00),
        stockQuantity: z.number().int().min(0).max(1_000_000),
        isActive: z.boolean().default(true),
      }),
    )
    .max(500),
});

/**
 * Replace-all upsert for a product's variant matrix.
 *
 * Strategy (idempotent per call):
 *   1. Delete all existing options/values/variants for the product.
 *      (Cascade kills join rows + variant rows automatically.)
 *   2. Insert provided options + values, capture their IDs.
 *   3. Insert variants, then resolve each combination to value IDs
 *      and write the join rows.
 *
 * If `options` is empty we wipe everything and exit — useful for
 * "this product no longer has variants" toggles.
 */
export const upsertVariantMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => variantMatrixInput.parse(i))
  .handler(async ({ data, context }) => {
    const owned = await assertOwnerOfProduct(data.productId, context.userId);

    // 1. Wipe existing structure for this product.
    const { error: delVarErr } = await sb
      .from("product_variants").delete().eq("product_id", data.productId);
    if (delVarErr) throw new Error(delVarErr.message);
    const { error: delOptErr } = await sb
      .from("variant_options").delete().eq("product_id", data.productId);
    if (delOptErr) throw new Error(delOptErr.message);

    if (data.options.length === 0) {
      invalidateTenant(owned.tenant_id);
      return { ok: true, optionCount: 0, variantCount: 0 };
    }

    // 2. Insert options + values.
    const optionRows = data.options.map((o, idx) => ({
      product_id: data.productId,
      name: o.name,
      position: idx,
    }));
    const { data: insertedOpts, error: oErr } = await sb
      .from("variant_options").insert(optionRows).select("id, name, position");
    if (oErr) throw new Error(oErr.message);

    const optionByName = new Map<string, any>(
      (insertedOpts ?? []).map((o: any) => [o.name.toLowerCase(), o]),
    );

    const valueRows: any[] = [];
    for (const o of data.options) {
      const opt = optionByName.get(o.name.toLowerCase());
      if (!opt) continue;
      o.values.forEach((v, idx) => {
        valueRows.push({ option_id: opt.id, value: v, position: idx });
      });
    }
    let insertedValues: any[] = [];
    if (valueRows.length > 0) {
      const { data: vals, error: vErr } = await sb
        .from("variant_option_values").insert(valueRows).select("id, option_id, value");
      if (vErr) throw new Error(vErr.message);
      insertedValues = vals ?? [];
    }
    const valueKey = (optionId: string, value: string) =>
      `${optionId}::${value.toLowerCase()}`;
    const valueIdByKey = new Map<string, string>(
      insertedValues.map((v: any) => [valueKey(v.option_id, v.value), v.id]),
    );

    if (data.variants.length === 0) {
      invalidateTenant(owned.tenant_id);
      return { ok: true, optionCount: insertedOpts?.length ?? 0, variantCount: 0 };
    }

    // 3. Insert variants then join rows.
    const variantRows = data.variants.map((v, idx) => ({
      product_id: data.productId,
      sku: v.sku?.trim() || null,
      price_cents: v.priceCents,
      stock_quantity: v.stockQuantity,
      position: idx,
      is_active: v.isActive,
    }));
    const { data: insertedVariants, error: vErr } = await sb
      .from("product_variants").insert(variantRows).select("id");
    if (vErr) throw new Error(vErr.message);

    const joinRows: { variant_id: string; option_value_id: string }[] = [];
    (insertedVariants ?? []).forEach((row: any, idx: number) => {
      const combo = data.variants[idx].combination;
      for (const c of combo) {
        const opt = optionByName.get(c.optionName.toLowerCase());
        if (!opt) continue;
        const valId = valueIdByKey.get(valueKey(opt.id, c.value));
        if (valId) joinRows.push({ variant_id: row.id, option_value_id: valId });
      }
    });
    if (joinRows.length > 0) {
      const { error: jErr } = await sb
        .from("product_variant_option_values").insert(joinRows);
      if (jErr) throw new Error(jErr.message);
    }

    invalidateTenant(owned.tenant_id);
    return {
      ok: true,
      optionCount: insertedOpts?.length ?? 0,
      variantCount: insertedVariants?.length ?? 0,
    };
  });

// =============== PROMO CODES ===============

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

async function resolvePromo(
  tenantId: string,
  code: string,
  subtotalCents: number,
): Promise<
  | { ok: true; promo: any; discountCents: number }
  | { ok: false; reason: string }
> {
  const norm = normalizeCode(code);
  if (!norm) return { ok: false, reason: "Enter a promo code" };
  const { data: p, error } = await sb
    .from("promo_codes")
    .select("id, code, type, value, min_subtotal_cents, max_redemptions, redemptions_count, starts_at, expires_at, is_active")
    .eq("tenant_id", tenantId)
    .ilike("code", norm)
    .maybeSingle();
  if (error) return { ok: false, reason: "Could not validate code" };
  if (!p) return { ok: false, reason: "Invalid promo code" };
  if (!p.is_active) return { ok: false, reason: "This code is inactive" };
  const now = Date.now();
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { ok: false, reason: "This code isn't active yet" };
  if (p.expires_at && new Date(p.expires_at).getTime() < now) return { ok: false, reason: "This code has expired" };
  if (subtotalCents < (p.min_subtotal_cents ?? 0)) {
    return { ok: false, reason: `Add more to your cart to use this code` };
  }
  if (p.max_redemptions != null && (p.redemptions_count ?? 0) >= p.max_redemptions) {
    return { ok: false, reason: "This code has reached its limit" };
  }
  const discount =
    p.type === "percent"
      ? Math.floor((subtotalCents * Math.min(100, Math.max(0, p.value))) / 100)
      : Math.min(subtotalCents, Math.max(0, p.value));
  return { ok: true, promo: p, discountCents: discount };
}

export const listPromos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { data: rows, error } = await sb
      .from("promo_codes")
      .select("id, code, type, value, min_subtotal_cents, max_redemptions, redemptions_count, starts_at, expires_at, is_active, created_at, updated_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { promos: rows ?? [] };
  });

export const upsertPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        tenantId: z.string().uuid(),
        id: z.string().uuid().optional(),
        code: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_-]+$/),
        type: z.enum(["percent", "fixed"]),
        value: z.number().int().min(1).max(1_000_000),
        minSubtotalCents: z.number().int().min(0).default(0),
        maxRedemptions: z.number().int().min(1).max(1_000_000).optional().nullable(),
        startsAt: z.string().datetime().optional().nullable(),
        expiresAt: z.string().datetime().optional().nullable(),
        isActive: z.boolean().default(true),
      })
      .refine((v) => v.type !== "percent" || v.value <= 100, {
        message: "Percent must be 1–100",
        path: ["value"],
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const payload: any = {
      tenant_id: data.tenantId,
      code: normalizeCode(data.code),
      type: data.type,
      value: data.value,
      min_subtotal_cents: data.minSubtotalCents,
      max_redemptions: data.maxRedemptions ?? null,
      starts_at: data.startsAt ?? null,
      expires_at: data.expiresAt ?? null,
      is_active: data.isActive,
    };
    if (data.id) {
      const { error } = await sb.from("promo_codes").update(payload).eq("id", data.id).eq("tenant_id", data.tenantId);
      if (error) throw new Error(error.message);
      invalidateTenant(data.tenantId);
      return { id: data.id };
    }
    const { data: row, error } = await sb.from("promo_codes").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    invalidateTenant(data.tenantId);
    return { id: row.id };
  });

export const deletePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const { error } = await sb.from("promo_codes").delete().eq("id", data.id).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    invalidateTenant(data.tenantId);
    return { ok: true };
  });

export const validatePromo = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        tenantId: z.string().uuid(),
        code: z.string().trim().min(1).max(60),
        subtotalCents: z.number().int().min(0),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    const r = await resolvePromo(data.tenantId, data.code, data.subtotalCents);
    if (!r.ok) return { ok: false as const, reason: r.reason };
    return {
      ok: true as const,
      code: r.promo.code,
      type: r.promo.type as "percent" | "fixed",
      value: r.promo.value as number,
      discountCents: r.discountCents,
    };
  });

// =============== CSV IMPORT / EXPORT ===============

const CSV_HEADERS = [
  "id",
  "sku",
  "name",
  "description",
  "price",
  "currency",
  "stock",
  "category_slug",
  "is_active",
  "sort_order",
  "image_url",
] as const;


function csvSerialize(rows: Record<string, unknown>[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(CSV_HEADERS.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n");
}

function csvParse(text: string): Record<string, string>[] {
  // RFC 4180-ish parser, handles quoted fields with embedded commas/newlines/quotes.
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch === "\r") { /* skip */ }
      else cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === "") continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = (cells[c] ?? "").trim();
    out.push(obj);
  }
  return out;
}

export const exportProductsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);
    const [{ data: products, error }, { data: cats }] = await Promise.all([
      sb.from("products")
        .select("id, sku, name, description, price_cents, currency, stock, category_id, is_active, sort_order, image_url")
        .eq("tenant_id", data.tenantId)
        .order("created_at"),
      sb.from("categories").select("id, slug").eq("tenant_id", data.tenantId),
    ]);
    if (error) throw new Error(error.message);
    const slugById = new Map<string, string>((cats ?? []).map((c: any) => [c.id, c.slug]));
    const rows = (products ?? []).map((p: any) => ({
      id: p.id,
      sku: p.sku ?? "",
      name: p.name,
      description: p.description ?? "",
      price: (p.price_cents / 100).toFixed(2),
      currency: p.currency,
      stock: p.stock,
      category_slug: p.category_id ? slugById.get(p.category_id) ?? "" : "",
      is_active: p.is_active ? "true" : "false",
      sort_order: p.sort_order ?? 0,
      image_url: p.image_url ?? "",
    }));
    return { csv: csvSerialize(rows), count: rows.length };
  });

const csvRowSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  sku: z.string().trim().max(60).optional().nullable(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  price: z.number().min(0).max(1_000_000),
  currency: z.string().trim().length(3),
  stock: z.number().int().min(0).max(1_000_000),
  category_slug: z.string().trim().max(80).optional().nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
  image_url: z.string().url().max(500).optional().nullable(),
});

export const importProductsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      tenantId: z.string().uuid(),
      csv: z.string().min(1).max(2_000_000),
      dryRun: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(data.tenantId, context.userId);

    const rawRows = csvParse(data.csv);
    if (rawRows.length > 5000) throw new Error("CSV too large (max 5000 rows).");

    const { data: cats } = await sb.from("categories").select("id, slug").eq("tenant_id", data.tenantId);
    const catBySlug = new Map<string, string>((cats ?? []).map((c: any) => [c.slug, c.id]));

    const { data: existing } = await sb
      .from("products").select("id, sku").eq("tenant_id", data.tenantId);
    const idSet = new Set<string>((existing ?? []).map((p: any) => p.id));
    const bySku = new Map<string, string>(); // sku -> id
    for (const p of existing ?? []) if (p.sku) bySku.set(p.sku, p.id);

    type RowResult = {
      row: number;
      action: "insert" | "update" | "error";
      error?: string;
      payload?: any;
      targetId?: string;
    };
    const results: RowResult[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const lineNo = i + 2; // header is line 1
      try {
        const parsed = csvRowSchema.parse({
          id: raw.id || undefined,
          sku: raw.sku || undefined,
          name: raw.name,
          description: raw.description || undefined,
          price: Number(raw.price ?? "0"),
          currency: (raw.currency || "EGP").toUpperCase(),
          stock: parseInt(raw.stock ?? "0", 10),
          category_slug: raw.category_slug || undefined,
          is_active: /^(true|1|yes|y)$/i.test(raw.is_active ?? "true"),
          sort_order: parseInt(raw.sort_order ?? "0", 10),
          image_url: raw.image_url || undefined,
        });

        let targetId: string | undefined;
        if (parsed.id && idSet.has(parsed.id)) targetId = parsed.id;
        else if (parsed.sku && bySku.has(parsed.sku)) targetId = bySku.get(parsed.sku);

        let categoryId: string | null = null;
        if (parsed.category_slug) {
          const cid = catBySlug.get(parsed.category_slug);
          if (!cid) throw new Error(`Unknown category_slug "${parsed.category_slug}"`);
          categoryId = cid;
        }

        const payload = {
          tenant_id: data.tenantId,
          name: parsed.name,
          sku: parsed.sku ?? null,
          description: parsed.description ?? null,
          price_cents: Math.round(parsed.price * 100),
          currency: parsed.currency,
          stock: parsed.stock,
          image_url: parsed.image_url ?? null,
          is_active: parsed.is_active,
          sort_order: parsed.sort_order,
          category_id: categoryId,
        };

        results.push({
          row: lineNo,
          action: targetId ? "update" : "insert",
          payload,
          targetId,
        });
      } catch (e: any) {
        const msg = e?.errors?.[0]?.message ?? e?.message ?? "Invalid row";
        results.push({ row: lineNo, action: "error", error: msg });
      }
    }

    const valid = results.filter((r) => r.action !== "error");
    const errors = results.filter((r) => r.action === "error");
    const inserts = results.filter((r) => r.action === "insert").length;
    const updates = results.filter((r) => r.action === "update").length;

    if (data.dryRun) {
      return {
        dryRun: true,
        total: results.length,
        inserts,
        updates,
        errors: errors.map((e) => ({ row: e.row, error: e.error! })),
        preview: results.slice(0, 50).map((r) => ({
          row: r.row,
          action: r.action,
          name: r.payload?.name ?? null,
          sku: r.payload?.sku ?? null,
          error: r.error ?? null,
        })),
      };
    }

    // Apply in batches.
    const toInsert = valid.filter((r) => r.action === "insert").map((r) => r.payload);
    const toUpdate = valid.filter((r) => r.action === "update");

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 200) {
        const batch = toInsert.slice(i, i + 200);
        const { error } = await sb.from("products").insert(batch);
        if (error) throw new Error(`Insert failed: ${error.message}`);
      }
    }
    for (const r of toUpdate) {
      const { error } = await sb.from("products").update(r.payload).eq("id", r.targetId!).eq("tenant_id", data.tenantId);
      if (error) throw new Error(`Update failed at row ${r.row}: ${error.message}`);
    }

    if (toInsert.length > 0 || toUpdate.length > 0) {
      invalidateTenant(data.tenantId);
    }

    return {
      dryRun: false,
      total: results.length,
      inserts,
      updates,
      errors: errors.map((e) => ({ row: e.row, error: e.error! })),
    };
  });
