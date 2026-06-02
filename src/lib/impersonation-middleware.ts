// Global server-fn middleware: read the impersonation cookie and block
// mutations while it is active. Registered in src/start.ts after the
// auth attacher. The cookie is HttpOnly + HMAC-signed, so we trust it
// only after verifyEnvelope().
import { createMiddleware } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import {
  IMPERSONATION_COOKIE,
  verifyEnvelope,
  type ImpersonationEnvelope,
} from "@/lib/impersonation.server";

/**
 * Server-fn names that are allowed to mutate WHILE impersonating.
 * Keep tiny and explicit — currently just the exit hatch.
 */
const READ_ONLY_ALLOWED_FN_NAMES = new Set<string>([
  "stopImpersonation",
  // startImpersonation is admin-only; while already-impersonating we still
  // allow it so an admin can hop directly between tenants without exiting.
  "startImpersonation",
]);

function readActiveEnvelope(): ImpersonationEnvelope | null {
  try {
    const raw = getCookie(IMPERSONATION_COOKIE);
    return verifyEnvelope(raw);
  } catch {
    return null;
  }
}

/**
 * Block any non-GET server-fn while an impersonation cookie is active.
 * Defense layer A. Domain layer (rbac.server.ts) is layer B.
 */
export const enforceImpersonationReadOnly = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta, method }) => {
    if (method === "GET") return next();
    const env = readActiveEnvelope();
    if (!env) return next();

    // TanStack embeds the original export name in serverFnMeta.name.
    const fnName = serverFnMeta?.name ?? "";
    if (READ_ONLY_ALLOWED_FN_NAMES.has(fnName)) return next();

    // Fire-and-forget audit. Don't block the rejection on the log write.
    try {
      const req = getRequest();
      const ua = req?.headers.get("user-agent") ?? null;
      const ip =
        req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req?.headers.get("cf-connecting-ip") ??
        null;
      const { writeAuditLog } = await import("@/lib/audit.server");
      void writeAuditLog({
        actorId: env.adminId,
        actorRole: "admin",
        action: "impersonation_write_blocked",
        targetTable: "tenants",
        targetId: env.tenantId,
        diff: { fnName, asUserId: env.asUserId },
        ip,
        userAgent: ua,
      });
    } catch {
      // swallow; never let logging mask the security response
    }
    throw new Error("IMPERSONATION_READ_ONLY: writes are disabled during impersonation");
  },
);

/**
 * Inject `context.impersonation` for any server-fn that composes this
 * middleware. Optional — read-only enforcement above is global; this is
 * only needed when downstream code wants the envelope.
 */
export const injectImpersonationContext = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const env = readActiveEnvelope();
    return next({ context: { impersonation: env } });
  },
);