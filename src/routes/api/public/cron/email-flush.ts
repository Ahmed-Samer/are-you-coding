import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sb = supabaseAdmin as any;

const MAX_BATCH = 25;
const MAX_ATTEMPTS = 5;

type ResendResp = { id?: string; message?: string; name?: string };

async function sendViaResend(to: string, subject: string, html: string, from: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (res.ok) return { ok: true };
  let body: ResendResp = {};
  try { body = await res.json(); } catch { /* ignore */ }
  return { ok: false, error: body.message ?? body.name ?? `Resend HTTP ${res.status}` };
}

function renderTemplate(template: string, payload: Record<string, any>): { subject: string; html: string } {
  const brand = "RentWebify";
  switch (template) {
    case "payment_proof_approved":
      return {
        subject: `${brand}: your payment was approved`,
        html: `<p>Hi,</p><p>Your payment proof for <strong>${payload.tenant_name ?? "your store"}</strong> has been approved. Your subscription is now active.</p><p>— ${brand}</p>`,
      };
    case "payment_proof_rejected":
      return {
        subject: `${brand}: action required on your payment`,
        html: `<p>Hi,</p><p>Your payment proof for <strong>${payload.tenant_name ?? "your store"}</strong> was rejected.</p><p><em>${payload.reviewer_notes ?? "Please re-submit a clearer screenshot."}</em></p><p>— ${brand}</p>`,
      };
    case "domain_verified":
      return {
        subject: `${brand}: domain verified`,
        html: `<p>Your domain <strong>${payload.host}</strong> is verified and ready to use.</p>`,
      };
    case "tenant_suspended":
      return {
        subject: `${brand}: store suspended`,
        html: `<p>Your store <strong>${payload.tenant_name}</strong> was suspended. Reason: ${payload.reason ?? "policy review"}.</p>`,
      };
    default:
      return {
        subject: payload.subject ?? `${brand} notification`,
        html: payload.html ?? `<p>${payload.message ?? ""}</p>`,
      };
  }
}

export const Route = createFileRoute("/api/public/cron/email-flush")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return new Response("not configured", { status: 503 });
        const header = request.headers.get("authorization") ?? "";
        if (header !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

        const resendKey = process.env.RESEND_API_KEY;
        const fromAddress = process.env.EMAIL_FROM ?? "RentWebify <no-reply@rentwebify.app>";
        if (!resendKey) {
          return Response.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 503 });
        }

        // Atomic claim via SELECT … FOR UPDATE SKIP LOCKED so two workers
        // can't grab the same row. The RPC marks `claimed_at = now()` and
        // returns the claimed rows; we clear `claimed_at` on success/fail.
        const { data: rows, error } = await sb.rpc("claim_email_outbox_batch", {
          p_limit: MAX_BATCH,
          p_stale_minutes: 5,
        });
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const row of rows ?? []) {
          const { subject, html } = renderTemplate(row.template, row.payload ?? {});
          const send = await sendViaResend(row.to_email, subject, html, fromAddress, resendKey);
          const attempts = (row.attempts ?? 0) + 1;
          if (send.ok) {
            await sb
              .from("email_outbox")
              .update({ status: "sent", attempts, sent_at: new Date().toISOString(), last_error: null, claimed_at: null })
              .eq("id", row.id);
            results.push({ id: row.id, ok: true });
          } else {
            const status = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
            await sb
              .from("email_outbox")
              .update({ status, attempts, last_error: send.error, claimed_at: null })
              .eq("id", row.id);
            results.push({ id: row.id, ok: false, error: send.error });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
