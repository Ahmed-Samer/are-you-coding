import { test, expect } from "@playwright/test";
import { RUN_PREFIX, tag } from "../fixtures/run-id";
import { getServiceClient } from "../fixtures/supabase";

// Public storefront flow — anon shopper from a clean browser context.
test.use({ storageState: { cookies: [], origins: [] } });

const STORE_SLUG = tag("shop").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);
const STORE_NAME = `E2E Shop ${RUN_PREFIX.slice(-6)}`;
const PRODUCT_NAME = `E2E Widget ${RUN_PREFIX.slice(-6)}`;
const PRODUCT_SKU = tag("sku-widget");
const TENANT_WA = "+201001234567";

let tenantId: string;

test.beforeAll(async () => {
  const sb = getServiceClient();

  const adminEmail = process.env.E2E_ADMIN_EMAIL!;
  const { data: list, error: lErr } = await sb.auth.admin.listUsers();
  if (lErr) throw lErr;
  const ownerId = list.users.find((u) => u.email === adminEmail)?.id;
  expect(ownerId, "admin user must exist to own the seed tenant").toBeTruthy();

  // Active tenant so the storefront route renders.
  const { data: tenant, error: tErr } = await sb
    .from("tenants")
    .insert({
      owner_id: ownerId,
      slug: STORE_SLUG,
      name: STORE_NAME,
      niche: "retail",
      status: "active",
      whatsapp_e164: TENANT_WA,
      currency: "EGP",
      is_accepting_orders: true,
    })
    .select("id")
    .single();
  if (tErr) throw tErr;
  tenantId = tenant.id;

  const { error: pErr } = await sb.from("products").insert({
    tenant_id: tenantId,
    name: PRODUCT_NAME,
    sku: PRODUCT_SKU,
    price_cents: 25000,
    currency: "EGP",
    stock: 10,
    is_active: true,
  });
  if (pErr) throw pErr;
});

test.describe("storefront checkout", () => {
  test("anon shopper can add to cart and dispatch order via WhatsApp", async ({ page }) => {
    // Intercept WhatsApp hand-off so the test stays headless and we can assert on it.
    await page.addInitScript(() => {
      (window as any).__waOpened = [];
      window.open = ((url?: string | URL) => {
        try {
          (window as any).__waOpened.push(String(url));
        } catch { /* ignore */ }
        return null;
      }) as typeof window.open;
    });

    // Storefront on a platform host via ?store= override.
    await page.goto(`/?store=${STORE_SLUG}`);
    await expect(page.getByRole("heading", { name: STORE_NAME, exact: false })).toBeVisible({ timeout: 15_000 });

    // Quick-add the seeded product.
    const quickAdd = page.getByRole("button", { name: new RegExp(`quick add ${PRODUCT_NAME}`, "i") });
    await quickAdd.click();

    // Open the cart drawer.
    await page.getByRole("button", { name: /open cart/i }).click();
    await expect(page.getByRole("heading", { name: /your cart/i })).toBeVisible();

    // Move to checkout details.
    await page.getByRole("button", { name: /^checkout$/i }).click();
    await expect(page.getByRole("heading", { name: /your details/i })).toBeVisible();

    await page.getByLabel(/full name/i).fill(`${RUN_PREFIX} Shopper`);
    await page.getByLabel(/^phone$/i).fill("+201112223344");
    await page.getByLabel(/delivery address/i).fill("12 Test St, Cairo");

    await page.getByRole("button", { name: /review order/i }).click();
    await expect(page.getByRole("heading", { name: /review order/i })).toBeVisible();

    // Final send → confirm dialog → submit.
    await page.getByRole("button", { name: /send order via whatsapp/i }).click();
    await page.getByRole("button", { name: /send via whatsapp/i }).click();

    // The drawer closes once the WhatsApp hand-off fires; wait for it.
    await expect(page.getByRole("heading", { name: /review order/i })).toBeHidden({ timeout: 15_000 });

    // Assert the WhatsApp URL we intercepted is well-formed and aimed at the tenant number.
    const opened: string[] = await page.evaluate(() => (window as any).__waOpened ?? []);
    expect(opened.length, "window.open should be called for WhatsApp hand-off").toBeGreaterThan(0);
    const waUrl = opened[0]!;
    expect(waUrl).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(waUrl).toContain(TENANT_WA.replace(/^\+/, ""));
    expect(decodeURIComponent(waUrl)).toContain(PRODUCT_NAME);
    expect(decodeURIComponent(waUrl)).toContain(STORE_NAME);

    // Verify the order persisted, tagged with RUN_PREFIX so teardown removes it.
    const sb = getServiceClient();
    const { data: orders, error } = await sb
      .from("orders")
      .select("id, status, customer_name, total_cents")
      .eq("tenant_id", tenantId)
      .like("customer_name", `${RUN_PREFIX}%`);
    if (error) throw error;
    expect(orders?.length, "exactly one order should be created").toBe(1);
    expect(orders![0].total_cents).toBeGreaterThan(0);
  });
});
