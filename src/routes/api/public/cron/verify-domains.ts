import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

const MAX_ATTEMPTS_BEFORE_FAIL = 24; // ~2h at 5min cadence

function requireCronAuth(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("not configured", { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  return null;
}

async function dohTxt(host: string): Promise<string[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=TXT`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error(`DoH ${res.status}`);
  const json: any = await res.json();
  return (json.Answer ?? []).map((a: any) => String(a.data ?? "").replace(/^"|"$/g, ""));
}

export const Route = createFileRoute("/api/public/cron/verify-domains")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = requireCronAuth(request);
        if (auth) return auth;

        // Pull rows due for a check. We avoid an exact "attempted_at" column
        // by relying on attempt history: only re-check rows whose most recent
        // attempt is older than 2 minutes (or has none).
        const { data: domains, error } = await sb
          .from("domains")
          .select("id, host, verification_token, status, tenant_id")
          .in("status", ["pending", "verifying"])
          .limit(50);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: Array<{ id: string; status: string; success: boolean }> = [];

        for (const d of domains ?? []) {
          // Recent-attempt throttle
          const { data: lastAttempt } = await sb
            .from("domain_verification_attempts")
            .select("attempted_at")
            .eq("domain_id", d.id)
            .order("attempted_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastAttempt) {
            const ageMs = Date.now() - new Date(lastAttempt.attempted_at).getTime();
            if (ageMs < 2 * 60_000) continue;
          }

          let found: string | null = null;
          let success = false;
          let attemptError: string | null = null;
          try {
            const answers = await dohTxt(`_rentwebify-verify.${d.host}`);
            found = answers.join(",") || null;
            success = answers.some((a) => a.includes(d.verification_token));
          } catch (e: any) {
            attemptError = e?.message ?? "DNS lookup failed";
          }

          await sb.from("domain_verification_attempts").insert({
            domain_id: d.id,
            record_type: "TXT",
            expected: d.verification_token,
            found,
            success,
            error: attemptError,
          });

          let nextStatus = d.status;
          if (success) {
            nextStatus = "verified";
            await sb
              .from("domains")
              .update({ status: "verified", verified_at: new Date().toISOString() })
              .eq("id", d.id);
          } else {
            // Count attempts; flip to failed after threshold.
            const { count } = await sb
              .from("domain_verification_attempts")
              .select("*", { count: "exact", head: true })
              .eq("domain_id", d.id);
            if ((count ?? 0) >= MAX_ATTEMPTS_BEFORE_FAIL) {
              nextStatus = "failed";
              await sb.from("domains").update({ status: "failed" }).eq("id", d.id);
            } else if (d.status === "pending") {
              nextStatus = "verifying";
              await sb.from("domains").update({ status: "verifying" }).eq("id", d.id);
            }
          }

          results.push({ id: d.id, status: nextStatus, success });
        }

        return Response.json({ ok: true, checked: results.length, results });
      },
    },
  },
});
