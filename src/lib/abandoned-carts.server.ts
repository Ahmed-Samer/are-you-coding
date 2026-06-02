// Server-only helpers for abandoned-cart recovery: token gen + WhatsApp
// dispatch via Meta Cloud API. The `.server.ts` extension keeps this out
// of the client bundle.
import { randomBytes } from "node:crypto";

const META_API_BASE = "https://graph.facebook.com/v20.0";

/** 32 raw bytes → 43-char base64url token. Stored as-is, looked up by equality. */
export function generateRecoveryToken(): string {
  return randomBytes(32).toString("base64url");
}

export type WhatsAppDispatchInput = {
  toE164: string;            // recipient with leading + stripped or not — Meta accepts both
  storeName: string;
  customerName?: string | null;
  itemCount: number;
  subtotalDisplay: string;   // formatted by caller, e.g. "$42.00"
  recoveryUrl: string;
};

export type WhatsAppDispatchResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

/**
 * Send a recovery message via Meta WhatsApp Cloud API.
 * Uses a plain text body (free-form session message) for MVP. For 24h+ contacts
 * the merchant must register an HSM template; we surface that as a `failed`
 * attempt rather than crash the cron run.
 */
export async function sendWhatsAppRecovery(
  input: WhatsAppDispatchInput,
): Promise<WhatsAppDispatchResult> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneId = process.env.WHATSAPP_FROM_PHONE_ID;
  if (!token || !phoneId) {
    return { ok: false, error: "WHATSAPP_NOT_CONFIGURED" };
  }

  const greet = input.customerName?.trim()
    ? `Hi ${input.customerName.trim()},`
    : "Hi there,";
  const body =
    `${greet}\n\n` +
    `You left ${input.itemCount} item${input.itemCount === 1 ? "" : "s"} ` +
    `(${input.subtotalDisplay}) in your ${input.storeName} cart.\n\n` +
    `Pick up where you left off: ${input.recoveryUrl}`;

  // Meta accepts the recipient WITHOUT the leading '+'.
  const to = input.toE164.replace(/^\+/, "");

  let res: Response;
  try {
    res = await fetch(`${META_API_BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: true, body },
      }),
    });
  } catch (e) {
    return { ok: false, error: `NETWORK: ${(e as Error).message}` };
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j: any = await res.json();
      detail = j?.error?.message ?? detail;
    } catch {
      /* ignore */
    }
    return { ok: false, error: detail.slice(0, 500) };
  }

  let providerMessageId: string | null = null;
  try {
    const j: any = await res.json();
    providerMessageId = j?.messages?.[0]?.id ?? null;
  } catch {
    /* ignore */
  }
  return { ok: true, providerMessageId };
}

/** Cheap money formatter for the WhatsApp body. */
export function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${currency} ${amount}`;
}