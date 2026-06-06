import { test, expect } from "@playwright/test";
import { RUN_PREFIX, tag } from "../fixtures/run-id";
import { getServiceClient } from "../fixtures/supabase";

// Fresh-signup flow — must use a clean (anonymous) browser context.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("tenant signup and onboarding", () => {
  test("new user can sign up and create their first store", async ({ page }) => {
    const unique = `${RUN_PREFIX}-${Date.now().toString(36)}`;
    const email = `${unique}@e2e.rentwebify.com`;
    const password = "E2E-Test-Passw0rd!";
    const storeSlug = tag("tenant1").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);
    const storeName = `E2E Store ${unique.slice(-6)}`;

    // 1. Signup
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("E2E Tester");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /create account/i }).click();

    // The app may either redirect to /login (email confirmation flow) or take
    // the user straight to /onboarding when email confirmation is disabled.
    await page.waitForURL(/\/(login|onboarding|dashboard)/, { timeout: 15_000 });

    if (page.url().includes("/login")) {
      // Confirm via service-role admin API so the spec doesn't depend on an inbox.
      const sb = getServiceClient();
      const { data: list, error } = await sb.auth.admin.listUsers();
      if (error) throw error;
      const user = list.users.find((u) => u.email === email);
      expect(user, `user ${email} should exist after signup`).toBeTruthy();
      await sb.auth.admin.updateUserById(user!.id, { email_confirm: true });

      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 15_000 });
    }

    // 2. Onboarding wizard
    if (!page.url().includes("/onboarding")) {
      await page.goto("/onboarding");
    }

    // Step 1 — basics
    await page.getByLabel(/store name/i).fill(storeName);
    const slugInput = page.getByLabel(/store address/i);
    await slugInput.fill("");
    await slugInput.fill(storeSlug);
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 2 — template (first available is selected by default)
    await expect(page.getByRole("heading", { name: /choose a template/i })).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 3 — plan
    await expect(page.getByRole("heading", { name: /pick your plan/i })).toBeVisible();
    // Select the first plan card (any monthly plan).
    const firstPlanCard = page.locator("button:has-text('$')").first();
    await firstPlanCard.click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 4 — confirm
    await page.getByRole("button", { name: /create store/i }).click();

    // Lands on checkout for the new subscription.
    await page.waitForURL(/\/checkout\//, { timeout: 20_000 });

    // 3. Verify in DB
    const sb = getServiceClient();
    const { data: tenants } = await sb
      .from("tenants")
      .select("id, slug, name, owner_id")
      .eq("slug", storeSlug);
    expect(tenants?.length, `tenant with slug ${storeSlug} should exist`).toBe(1);
    expect(tenants![0].name).toBe(storeName);
  });
});
