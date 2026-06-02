import { test, expect } from "@playwright/test";
import { RUN_PREFIX, tag } from "../fixtures/run-id";
import { getServiceClient } from "../fixtures/supabase";

// Admin flow — relies on the chromium-admin storage state populated by global-setup.
test.describe.configure({ mode: "serial" });

const STORE_SLUG = tag("billing").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);
const STORE_NAME = `E2E Billing ${RUN_PREFIX.slice(-6)}`;
const PLAN_SLUG = tag("plan-basic").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);
const METHOD_LABEL = `${RUN_PREFIX} InstaPay`;
const PROOF_REF = tag("ref-001");

let tenantId: string;
let subscriptionId: string;
let proofId: string;

test.beforeAll(async () => {
  const sb = getServiceClient();

  const adminEmail = process.env.E2E_ADMIN_EMAIL!;
  const { data: list, error: lErr } = await sb.auth.admin.listUsers();
  if (lErr) throw lErr;
  const ownerId = list.users.find((u) => u.email === adminEmail)?.id;
  expect(ownerId, "admin user must exist to own the seed tenant").toBeTruthy();

  // Pending tenant → approving the proof should flip it to active.
  const { data: tenant, error: tErr } = await sb
    .from("tenants")
    .insert({
      owner_id: ownerId,
      slug: STORE_SLUG,
      name: STORE_NAME,
      niche: "retail",
      status: "pending",
      currency: "EGP",
    })
    .select("id")
    .single();
  if (tErr) throw tErr;
  tenantId = tenant.id;

  const { data: plan, error: planErr } = await sb
    .from("plans")
    .insert({
      slug: PLAN_SLUG,
      name: `E2E Plan ${RUN_PREFIX.slice(-6)}`,
      price_usd: 10,
      interval: "monthly",
      features: [],
      is_active: true,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;

  const { data: method, error: mErr } = await sb
    .from("payment_methods")
    .insert({
      kind: "instapay",
      label: METHOD_LABEL,
      account_identifier: "e2e@instapay",
      is_active: true,
    })
    .select("id")
    .single();
  if (mErr) throw mErr;

  const { data: sub, error: sErr } = await sb
    .from("subscriptions")
    .insert({
      tenant_id: tenantId,
      plan_id: plan.id,
      status: "pending_payment",
      currency: "USD",
    })
    .select("id")
    .single();
  if (sErr) throw sErr;
  subscriptionId = sub.id;

  const { data: proof, error: prErr } = await sb
    .from("payment_proofs")
    .insert({
      subscription_id: subscriptionId,
      tenant_id: tenantId,
      payment_method_id: method.id,
      reference_number: PROOF_REF,
      amount_usd: 10,
      amount_egp: 500,
      status: "pending",
    })
    .select("id")
    .single();
  if (prErr) throw prErr;
  proofId = proof.id;
});

test.describe("admin proof approval", () => {
  test.use({ storageState: "e2e/storage/admin.json" });

  test("admin can approve a pending payment proof and activate the subscription", async ({ page }) => {
    await page.goto("/admin/payments");
    await expect(page.getByRole("heading", { name: /payment proofs/i })).toBeVisible({ timeout: 15_000 });

    // Narrow the table to our seeded proof via the search box (tenant or reference).
    await page.getByPlaceholder(/search tenant or reference/i).fill(PROOF_REF);

    // The row should appear; open the review drawer.
    const row = page.getByRole("row", { name: new RegExp(PROOF_REF, "i") });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    // Drawer pops with an Approve button.
    const approve = page.getByRole("button", { name: /approve\s*\(A\)/i });
    await expect(approve).toBeVisible();
    await approve.click();

    // Toast confirms approval.
    await expect(page.getByText(/proof approved/i)).toBeVisible({ timeout: 10_000 });

    // Database side-effects: subscription active + tenant active.
    const sb = getServiceClient();
    await expect.poll(async () => {
      const { data } = await sb
        .from("subscriptions")
        .select("status, period_end")
        .eq("id", subscriptionId)
        .maybeSingle();
      return data?.status ?? null;
    }, { timeout: 10_000 }).toBe("active");

    const { data: tenantAfter } = await sb
      .from("tenants")
      .select("status")
      .eq("id", tenantId)
      .maybeSingle();
    expect(tenantAfter?.status).toBe("active");

    const { data: proofAfter } = await sb
      .from("payment_proofs")
      .select("status, reviewer_id")
      .eq("id", proofId)
      .maybeSingle();
    expect(proofAfter?.status).toBe("approved");
    expect(proofAfter?.reviewer_id).toBeTruthy();
  });
});
