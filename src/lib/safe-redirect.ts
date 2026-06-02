/** Only allow same-origin relative paths to prevent open-redirect abuse. */
export function safeRedirect(r: string | undefined | null): string | null {
  if (!r) return null;
  if (!r.startsWith("/") || r.startsWith("//")) return null;
  return r;
}
