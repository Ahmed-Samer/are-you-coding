// Maps raw Supabase Auth errors into user-friendly messages.
// Primarily handles HIBP (`weak_password` / "pwned" / "breach" copy) and
// rate-limit style errors. Falls back to the original message.

export function mapAuthError(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "")
        : "";
  const msg = raw.toLowerCase();
  if (!msg) return "Something went wrong. Please try again.";

  if (msg.includes("pwned") || msg.includes("breach") || msg.includes("compromised")) {
    return "This password appeared in a known data breach. Choose a different one.";
  }
  if (msg.includes("weak_password") || msg.includes("weak password")) {
    return "That password is too weak. Use 8+ characters with letters, numbers, and symbols.";
  }
  if (msg.includes("rate") && msg.includes("limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("over_email_send_rate_limit")) {
    return "Too many emails sent. Please wait a few minutes before trying again.";
  }
  return raw;
}

/**
 * Deterministic check for Supabase's "email not confirmed" state.
 * Inspects typed fields (`code`, `name`, `status` + `error_code`) before
 * falling back to a localized message match, so the resend affordance
 * surfaces regardless of message wording or locale.
 */
export function isUnconfirmedAccountError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code.toLowerCase() : "";
  const name = typeof e.name === "string" ? e.name.toLowerCase() : "";
  const errorCode = typeof e.error_code === "string" ? (e.error_code as string).toLowerCase() : "";
  if (code === "email_not_confirmed") return true;
  if (errorCode === "email_not_confirmed") return true;
  if (name === "authapierror" && e.status === 400 && code.includes("not_confirmed")) return true;
  const msg = typeof e.message === "string" ? (e.message as string).toLowerCase() : "";
  return msg.includes("not confirmed") || msg.includes("email not confirmed");
}

/**
 * Detects Supabase signup responses indicating the email is already in use,
 * so the UI can render a neutral, non-enumerating notice. Checks typed
 * fields first, then falls back to message substrings.
 */
export function isDuplicateAccountError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code.toLowerCase() : "";
  const errorCode =
    typeof e.error_code === "string" ? (e.error_code as string).toLowerCase() : "";
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    code === "email_address_already_in_use" ||
    errorCode === "user_already_exists" ||
    errorCode === "email_exists"
  ) {
    return true;
  }
  const msg = typeof e.message === "string" ? (e.message as string).toLowerCase() : "";
  return (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("already in use")
  );
}
