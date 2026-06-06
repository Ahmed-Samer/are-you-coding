import { createServerFn } from "@tanstack/react-start";
import { createHash } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertSameOrigin,
  enforceRateLimit,
  getClientIp,
} from "@/lib/rate-limit.server";

const sb = supabaseAdmin as any;

const LeadSource = z.enum(["exit_intent", "inline_hero", "sticky_cta"]);

const CaptureLeadInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address.")
    .max(254, "Email is too long."),
  source: LeadSource,
  referrer: z.string().trim().max(2048).optional().nullable(),
  utm_source: z.string().trim().max(255).optional().nullable(),
  utm_medium: z.string().trim().max(255).optional().nullable(),
  utm_campaign: z.string().trim().max(255).optional().nullable(),
});

export type CaptureLeadInputType = z.input<typeof CaptureLeadInput>;

function hashIp(ip: string): string {
  const salt = process.env.LEAD_IP_SALT ?? process.env.SUPABASE_PROJECT_ID ?? "lovable-lead-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function sanitizeOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, 2048);
}

async function sendPlaybookEmail(email: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  // تم تغيير البراند هنا لـ RentWebify
  const from = process.env.EMAIL_FROM ?? "RentWebify <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: "Your RentWebify launch playbook",
        html: `
          <p>Hi,</p>
          <p>Thanks for requesting the <strong>RentWebify Launch Playbook</strong>.</p>
          <p>Here's a short guide to launching a profitable Website-as-a-Service storefront:
          <a href="https://rentwebify.com/playbook.pdf">Download the PDF</a>.</p>
          <p>— The RentWebify team</p>
        `,
      }),
    });
    if (!res.ok) {
      console.error("[leads] Resend send failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[leads] Resend send threw", err);
  }
}

export const captureLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CaptureLeadInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    const ip = getClientIp();
    const ip_hash = ip === "unknown" ? null : hashIp(ip);

    // Per-IP: 5 requests per hour. Per-email: 3 per day.
    if (ip_hash) {
      await enforceRateLimit({
        table: "leads",
        filters: { ip_hash },
        max: 5,
        windowSec: 60 * 60,
        label: "lead submissions from this network",
      });
    }
    await enforceRateLimit({
      table: "leads",
      filters: { email: data.email },
      max: 3,
      windowSec: 60 * 60 * 24,
      label: "submissions for this email",
    });

    // Check duplicate first so we can short-circuit without inserting.
    const { data: existing } = await sb
      .from("leads")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    if (!existing) {
      const { error } = await sb.from("leads").insert({
        email: data.email,
        source: data.source,
        referrer: sanitizeOptional(data.referrer ?? null),
        utm_source: sanitizeOptional(data.utm_source ?? null),
        utm_medium: sanitizeOptional(data.utm_medium ?? null),
        utm_campaign: sanitizeOptional(data.utm_campaign ?? null),
        ip_hash,
      });
      if (error) {
        // Unique violation = race; treat as success.
        if (!String(error.code ?? "").startsWith("23")) {
          console.error("[leads] insert failed", error);
          throw new Error("We couldn't save your email. Please try again.");
        }
      } else {
        // Fire-and-forget; never block the response on email.
        sendPlaybookEmail(data.email).catch(() => undefined);
      }
    }

    return { ok: true } as const;
  });