import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Checkout — Upload Proof (Screen 21)
//
// Two-server-fn flow:
//   1. createProofUploadUrl  → mints a short-lived signed upload URL for a
//      tenant-scoped Storage path. The client PUTs the file directly to
//      Supabase Storage (off the Worker).
//   2. finalizeProofUpload   → server-side MIME sniff on the persisted
//      object, SHA-256, idempotent insert-or-replace of payment_proofs,
//      atomic transition of subscriptions.status → pending_review, audit
//      log entry.
//
// `client.server` is imported lazily inside each `.handler()` so the
// service-role module never leaks into client bundles via the route graph.
// ---------------------------------------------------------------------------

export type ProofUploadErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "WRONG_STATUS"
  | "WRONG_TYPE"
  | "OVERSIZE"
  | "MIME_MISMATCH"
  | "STORAGE_FAILED"
  | "TRANSIENT";

function proofError(
  code: ProofUploadErrorCode,
  message: string,
  extra?: Record<string, unknown>,
): Error {
  return new Error(JSON.stringify({ code, message, ...(extra ?? {}) }));
}

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

/**
 * Mints a signed upload URL the browser can PUT to directly. Validates
 * subscription ownership + current status, and reserves a tenant-scoped
 * object path so the file lands under RLS-acceptable foldering.
 */
export const createProofUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        contentType: z.enum(ALLOWED_MIMES),
        byteSize: z.number().int().positive().max(MAX_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, tenant_id, tenants!inner(owner_id)")
      .eq("id", data.subscriptionId)
      .maybeSingle<{ id: string; status: string; tenant_id: string; tenants: { owner_id: string } }>();
    if (error) throw proofError("TRANSIENT", error.message);
    if (!sub) throw proofError("NOT_FOUND", "Subscription not found.");
    if (sub.tenants.owner_id !== userId) {
      throw proofError("FORBIDDEN", "You don't have access to this checkout.");
    }
    if (sub.status !== "pending_payment" && sub.status !== "pending_review") {
      throw proofError(
        "WRONG_STATUS",
        "This checkout is no longer accepting proof uploads.",
        { status: sub.status },
      );
    }

    const ext = extForMime(data.contentType);
    // Tenant-scoped path so the existing storage.objects RLS (which keys on
    // (storage.foldername(name))[1] = tenant_id) keeps admin reads working.
    const storagePath = `${sub.tenant_id}/${sub.id}/proof-${Date.now()}.${ext}`;

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUploadUrl(storagePath);
    if (signErr || !signed) {
      throw proofError("STORAGE_FAILED", signErr?.message ?? "Could not create upload URL.");
    }

    return {
      uploadUrl: signed.signedUrl,
      token: signed.token,
      storagePath,
      contentType: data.contentType,
      maxBytes: MAX_BYTES,
    };
  });

/**
 * Confirms the upload, runs a server-side MIME sniff on the persisted
 * object, upserts the `payment_proofs` row (idempotent by subscription_id),
 * transitions the subscription to `pending_review`, and writes an audit
 * log entry.
 */
export const finalizeProofUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        storagePath: z.string().min(3).max(500),
        paymentMethodId: z.string().uuid(),
        referenceNumber: z.string().trim().min(3).max(80),
        notes: z.string().trim().max(500).optional(),
        declaredContentType: z.enum(ALLOWED_MIMES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sniffMime, sha256Hex } = await import("@/lib/checkout-proof.server");
    const { writeAuditLog } = await import("@/lib/audit.server");

    // 1. Ownership + status
    const { data: sub, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, tenant_id, tenants!inner(owner_id), plans!inner(price_usd)")
      .eq("id", data.subscriptionId)
      .maybeSingle<{
        id: string;
        status: string;
        tenant_id: string;
        tenants: { owner_id: string };
        plans: { price_usd: number | string };
      }>();
    if (sErr) throw proofError("TRANSIENT", sErr.message);
    if (!sub) throw proofError("NOT_FOUND", "Subscription not found.");
    if (sub.tenants.owner_id !== userId) {
      throw proofError("FORBIDDEN", "You don't have access to this checkout.");
    }
    if (sub.status !== "pending_payment" && sub.status !== "pending_review") {
      throw proofError(
        "WRONG_STATUS",
        "This checkout is no longer accepting proof uploads.",
        { status: sub.status },
      );
    }
    // Storage path must belong to this tenant + subscription (defence-in-depth).
    const expectedPrefix = `${sub.tenant_id}/${sub.id}/`;
    if (!data.storagePath.startsWith(expectedPrefix)) {
      throw proofError("FORBIDDEN", "Upload path does not match this checkout.");
    }

    // 2. Download the persisted object and sniff its real MIME.
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("payment-proofs")
      .download(data.storagePath);
    if (dlErr || !blob) {
      throw proofError("STORAGE_FAILED", dlErr?.message ?? "Uploaded file could not be read back.");
    }
    const byteSize = blob.size;
    if (byteSize > MAX_BYTES) {
      await supabaseAdmin.storage.from("payment-proofs").remove([data.storagePath]);
      throw proofError("OVERSIZE", "File is larger than the 10 MB limit.");
    }
    const arrayBuf = await blob.arrayBuffer();
    const fullBytes = new Uint8Array(arrayBuf);
    const head = fullBytes.slice(0, 16);
    const sniffed = sniffMime(head);
    if (!sniffed) {
      await supabaseAdmin.storage.from("payment-proofs").remove([data.storagePath]);
      throw proofError("MIME_MISMATCH", "File type not recognised. Upload a JPG, PNG, WebP, or PDF.");
    }
    if (sniffed !== data.declaredContentType) {
      await supabaseAdmin.storage.from("payment-proofs").remove([data.storagePath]);
      throw proofError(
        "MIME_MISMATCH",
        "File contents don't match the declared type. Try a different file.",
        { detected: sniffed, declared: data.declaredContentType },
      );
    }
    const sha = await sha256Hex(fullBytes);

    // 3. Compute authoritative amounts.
    const amountUsd = Number(sub.plans.price_usd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw proofError("TRANSIENT", "Plan price is invalid.");
    }
    const { data: fxRow, error: fxErr } = await supabaseAdmin
      .from("fx_rates")
      .select("rate")
      .eq("base_currency", "USD")
      .eq("quote_currency", "EGP")
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fxErr) throw proofError("TRANSIENT", fxErr.message);
    if (!fxRow) throw proofError("TRANSIENT", "FX rate not configured.");
    const fxRate = Number(fxRow.rate);
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      throw proofError("TRANSIENT", "FX rate invalid.");
    }
    const amountEgp = Math.round(amountUsd * fxRate * 100) / 100;

    // 4. Idempotent insert-or-replace keyed by subscription_id.
    //    Mark any prior still-pending proofs on this subscription as
    //    superseded so a fresh `pending` row is unambiguous.
    const supersedeNotes = "Superseded by re-upload";
    await supabaseAdmin
      .from("payment_proofs")
      .update({ status: "rejected", reviewer_notes: supersedeNotes })
      .eq("subscription_id", data.subscriptionId)
      .eq("status", "pending");

    const { data: insertedProof, error: insErr } = await supabaseAdmin
      .from("payment_proofs")
      .insert({
        subscription_id: data.subscriptionId,
        tenant_id: sub.tenant_id,
        payment_method_id: data.paymentMethodId,
        reference_number: data.referenceNumber,
        amount_usd: amountUsd,
        amount_egp: amountEgp,
        fx_rate: fxRate,
        screenshot_path: data.storagePath,
        notes: data.notes ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr || !insertedProof) {
      throw proofError("TRANSIENT", insErr?.message ?? "Could not record payment proof.");
    }

    // 5. Atomically transition subscription → pending_review.
    const { error: updErr } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "pending_review", updated_at: new Date().toISOString() })
      .eq("id", data.subscriptionId)
      .in("status", ["pending_payment", "pending_review"]);
    if (updErr) {
      throw proofError("TRANSIENT", updErr.message);
    }

    // 6. Audit log (best-effort, never blocks the user-facing transition).
    await writeAuditLog({
      actorId: userId,
      actorRole: "system",
      action: "proof.submitted",
      targetTable: "payment_proofs",
      targetId: insertedProof.id,
      diff: {
        subscription_id: data.subscriptionId,
        tenant_id: sub.tenant_id,
        storage_path: data.storagePath,
        mime: sniffed,
        byte_size: byteSize,
        sha256: sha,
        amount_usd: amountUsd,
      },
    });

    return {
      ok: true as const,
      proofId: insertedProof.id,
      storagePath: data.storagePath,
      mime: sniffed,
      byteSize,
      sha256: sha,
      amountUsd,
      amountEgp,
      fxRate,
    };
  });