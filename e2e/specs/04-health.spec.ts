import { test, expect } from "@playwright/test";

test.describe("public health endpoint", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("returns ok payload with version and db check", async ({ request }) => {
    const res = await request.get("/api/public/health");
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty("ok");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("checks.db");
    expect(typeof body.checks.db.latencyMs).toBe("number");

    // Cache-control should never be cached.
    expect(res.headers()["cache-control"]).toContain("no-store");

    // In CI against a deployed env, the db must be reachable.
    if (process.env.CI) {
      expect(body.ok, `health body=${JSON.stringify(body)}`).toBe(true);
      expect(res.status()).toBe(200);
    }
  });
});
