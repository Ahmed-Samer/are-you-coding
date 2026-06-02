import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

export const Route = createFileRoute("/api/public/cron/fx-rates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("not configured", { status: 503 });
        const header = request.headers.get("authorization") ?? "";
        if (header !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

        // Fetch USD -> EGP from a no-auth public source.
        let rate: number;
        try {
          const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=EGP");
          if (!res.ok) throw new Error(`source ${res.status}`);
          const json: any = await res.json();
          const raw = json?.rates?.EGP;
          rate = typeof raw === "number" ? raw : Number(raw);
          if (!Number.isFinite(rate) || rate <= 0) throw new Error("invalid rate");
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 502 });
        }

        // Skip insert if last row is < 6h old AND rate delta < 0.5%.
        const { data: latest } = await sb
          .from("fx_rates")
          .select("rate, effective_at")
          .eq("base_currency", "USD")
          .eq("quote_currency", "EGP")
          .order("effective_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          const ageHr = (Date.now() - new Date(latest.effective_at).getTime()) / 3_600_000;
          const delta = Math.abs(Number(latest.rate) - rate) / Number(latest.rate);
          if (ageHr < 6 && delta < 0.005) {
            return Response.json({ ok: true, skipped: true, rate });
          }
        }

        const { error } = await sb.from("fx_rates").insert({
          base_currency: "USD",
          quote_currency: "EGP",
          rate,
          effective_at: new Date().toISOString(),
        });
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        return Response.json({ ok: true, rate });
      },
    },
  },
});
