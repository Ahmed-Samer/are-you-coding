// src/lib/impersonation.server.ts
// Server-only HMAC helpers for the impersonation cookie envelope.
// Imported exclusively by impersonation.functions.ts and
// impersonation-middleware.ts — never reaches the client bundle.
import { createHmac, timingSafeEqual } from "node:crypto";

export type ImpersonationEnvelope = {
  v: 1;
  adminId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  asUserId: string;
  asUserEmail: string | null;
  startedAt: number; // ms epoch
  exp: number;       // ms epoch
};

export const IMPERSONATION_COOKIE = "lvbl_imp";
export const IMPERSONATION_META_COOKIE = "lvbl_imp_meta";
export const IMPERSONATION_MAX_AGE_SEC = 60 * 60; // 1h hard cap

function getSecret(): string {
  const s = process.env.IMPERSONATION_COOKIE_SECRET;
  if (!s) throw new Error("IMPERSONATION_COOKIE_SECRET is not set");
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return b64urlEncode(createHmac("sha256", getSecret()).update(payload).digest());
}

/** Serialize + sign an envelope into the cookie value `<payload>.<sig>`. */
export function signEnvelope(env: ImpersonationEnvelope): string {
  const payload = b64urlEncode(Buffer.from(JSON.stringify(env), "utf8"));
  return `${payload}.${sign(payload)}`;
}

/** Verify + parse a cookie value. Returns null on any failure. */
export function verifyEnvelope(raw: string | undefined | null): ImpersonationEnvelope | null {
  if (!raw || typeof raw !== "string") return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  let parsed: ImpersonationEnvelope;
  try {
    parsed = JSON.parse(b64urlDecode(payload).toString("utf8")) as ImpersonationEnvelope;
  } catch {
    return null;
  }
  if (parsed.v !== 1) return null;
  if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
  return parsed;
}

/** Public, display-only metadata stored in the readable companion cookie. */
export type ImpersonationMeta = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  asUserEmail: string | null;
  startedAt: number;
  exp: number;
};

export function encodeMeta(m: ImpersonationMeta): string {
  return b64urlEncode(Buffer.from(JSON.stringify(m), "utf8"));
}
export function decodeMeta(raw: string | undefined | null): ImpersonationMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw).toString("utf8")) as ImpersonationMeta;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}