import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

declare const __APP_VERSION__: string;
declare const __BUILT_AT__: string;

const MODULE_LOADED_AT = Date.now();
const DB_TIMEOUT_MS = 2000;

type DbCheck = { ok: true; latencyMs: number } | { ok: false; latencyMs: number; error: string };

async function checkDb(): Promise<DbCheck> {
  const started = Date.now();
  try {
    const result = await Promise.race([
      (supabaseAdmin as any).from("plans").select("id", { head: true, count: "exact" }).limit(1),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db_timeout")), DB_TIMEOUT_MS)),
    ]);
    const latencyMs = Date.now() - started;
    const err = (result as any)?.error;
    if (err) {
      const code = String(err.code ?? "").toUpperCase();
      const mapped = code === "42501" || code === "PGRST301" ? "db_unauthorized" : "db_unreachable";
      return { ok: false, latencyMs, error: mapped };
    }
    return { ok: true, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const msg = e instanceof Error ? e.message : "db_unreachable";
    const mapped = msg === "db_timeout" ? "db_timeout" : "db_unreachable";
    return { ok: false, latencyMs, error: mapped };
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const db = await checkDb();
        const ok = db.ok;
        const body = {
          ok,
          version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
          builtAt: typeof __BUILT_AT__ !== "undefined" ? __BUILT_AT__ : null,
          uptimeMs: Date.now() - MODULE_LOADED_AT,
          checks: { db },
        };
        return new Response(JSON.stringify(body), {
          status: ok ? 200 : 503,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
