import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

const PayloadSchema = z.object({
  route: z.string().trim().max(500).optional().nullable(),
  message: z.string().trim().min(1).max(2000),
  stack: z.string().trim().max(8000).optional().nullable(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

// Public, unauthenticated error sink for the browser hook. Rate-limited by IP.
export const Route = createFileRoute("/api/public/errors")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 4096) return new Response("payload too large", { status: 413 });

        let parsed: z.infer<typeof PayloadSchema>;
        try {
          parsed = PayloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("bad payload", { status: 400 });
        }

        // Best-effort IP-scoped rate limit: 10 / min.
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const since = new Date(Date.now() - 60_000).toISOString();
        const { count } = await sb
          .from("error_reports")
          .select("*", { count: "exact", head: true })
          .eq("scope", "client")
          .gte("created_at", since)
          .contains("meta", { ip });
        if ((count ?? 0) >= 10) return Response.json({ ok: false, throttled: true });

        const meta = { ...(parsed.meta ?? {}), ip };
        const { error } = await sb.from("error_reports").insert({
          scope: "client",
          route: parsed.route ?? null,
          message: parsed.message.slice(0, 2000),
          stack: parsed.stack ? parsed.stack.slice(0, 8000) : null,
          meta,
        });
        if (error) return new Response("insert failed", { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
