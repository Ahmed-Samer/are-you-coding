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

const ContactInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter your name.")
    .max(120, "Name is too long."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address.")
    .max(254, "Email is too long."),
  company: z
    .string()
    .trim()
    .max(160, "Company is too long.")
    .optional()
    .nullable(),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters.")
    .max(4000, "Message is too long."),
  // Honeypot. Real users never fill this; bots do. If non-empty we silently
  // return success without writing or emailing anything.
  website: z.string().max(0).optional().nullable().or(z.literal("")),
  referrer: z.string().trim().max(2048).optional().nullable(),
  user_agent: z.string().trim().max(1024).optional().nullable(),
});

export type ContactInputType = z.input<typeof ContactInput>;

function hashIp(ip: string): string {
  const salt =
    process.env.LEAD_IP_SALT ??
    process.env.SUPABASE_PROJECT_ID ??
    "lovable-contact-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function sanitizeOptional(value: string | null | undefined, max = 2048): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type NotificationPayload = {
  name: string;
  email: string;
  company: string | null;
  message: string;
};

async function sendContactNotification(
  payload: NotificationPayload,
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const from = process.env.EMAIL_FROM ?? "CoreWeb <onboarding@resend.dev>";
  const to = process.env.CONTACT_INBOX ?? "hello@coreweb.app";

  const safeName = escapeHtml(payload.name);
  const safeEmail = escapeHtml(payload.email);
  const safeCompany = payload.company ? escapeHtml(payload.company) : "—";
  const safeMessage = escapeHtml(payload.message).replace(/\n/g, "<br/>");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: payload.email,
        subject: `New contact message from ${payload.name}`,
        html: `
          <h2 style="font-family:Arial,sans-serif;font-size:18px;margin:0 0 12px;">New contact form submission</h2>
          <table style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;border-collapse:collapse;">
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td>${safeName}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td>${safeEmail}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Company</td><td>${safeCompany}</td></tr>
          </table>
          <h3 style="font-family:Arial,sans-serif;font-size:14px;margin:20px 0 8px;">Message</h3>
          <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;">${safeMessage}</div>
        `,
      }),
    });
    if (!res.ok) {
      console.error(
        "[contact] Resend send failed",
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.error("[contact] Resend send threw", err);
  }
}

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ContactInput.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    // Honeypot tripped — pretend success, do nothing.
    if (typeof data.website === "string" && data.website.length > 0) {
      return { ok: true } as const;
    }

    const ip = getClientIp();
    const ip_hash = ip === "unknown" ? null : hashIp(ip);

    // Per-IP: 5 / hour. Per-email: 3 / 24h.
    if (ip_hash) {
      await enforceRateLimit({
        table: "contact_messages",
        filters: { ip_hash },
        max: 5,
        windowSec: 60 * 60,
        label: "contact submissions from this network",
      });
    }
    await enforceRateLimit({
      table: "contact_messages",
      filters: { email: data.email },
      max: 3,
      windowSec: 60 * 60 * 24,
      label: "submissions for this email",
    });

    const company = sanitizeOptional(data.company ?? null, 160);

    const { error } = await sb.from("contact_messages").insert({
      name: data.name,
      email: data.email,
      company,
      message: data.message,
      referrer: sanitizeOptional(data.referrer ?? null),
      user_agent: sanitizeOptional(data.user_agent ?? null, 1024),
      ip_hash,
    });

    if (error) {
      console.error("[contact] insert failed", error);
      throw new Error("We couldn't send your message. Please try again.");
    }

    // Fire-and-forget — never block the response on email delivery.
    sendContactNotification({
      name: data.name,
      email: data.email,
      company,
      message: data.message,
    }).catch(() => undefined);

    return { ok: true } as const;
  });