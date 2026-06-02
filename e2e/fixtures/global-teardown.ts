import { getServiceClient } from "./supabase";
import { RUN_PREFIX } from "./run-id";

// Best-effort cleanup. Any row tagged with RUN_PREFIX gets removed so the dev
// database doesn't accumulate e2e cruft. Wrap each step in try/catch — partial
// teardown is better than no teardown.
export default async function globalTeardown() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[e2e teardown] Supabase service env not set; skipping cleanup.");
    return;
  }
  const sb = getServiceClient();
  const like = `${RUN_PREFIX}%`;

  const steps: Array<{ label: string; fn: () => Promise<unknown> }> = [
    { label: "orders", fn: async () => { await sb.from("orders").delete().like("customer_name", like); } },
    { label: "products", fn: async () => { await sb.from("products").delete().like("sku", like); } },
    { label: "categories", fn: async () => { await sb.from("categories").delete().like("slug", like); } },
    { label: "payment_proofs", fn: async () => { await sb.from("payment_proofs").delete().like("reference_number", like); } },
    { label: "subscriptions(by tenant slug)", fn: async () => {
      const { data } = await sb.from("tenants").select("id").like("slug", like);
      if (!data || data.length === 0) return;
      await sb.from("subscriptions").delete().in("tenant_id", data.map((r: any) => r.id));
    } },
    { label: "tenants", fn: async () => { await sb.from("tenants").delete().like("slug", like); } },
    { label: "plans", fn: async () => { await sb.from("plans").delete().like("slug", like); } },
    { label: "payment_methods", fn: async () => { await sb.from("payment_methods").delete().like("label", like); } },
  ];

  for (const step of steps) {
    try {
      await step.fn();
    } catch (e) {
      console.warn(`[e2e teardown] step "${step.label}" failed:`, (e as Error).message);
    }
  }
  console.log(`[e2e teardown] cleaned rows tagged with ${RUN_PREFIX}`);
}
