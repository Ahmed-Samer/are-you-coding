import { toast as sonnerToast, type ExternalToast } from "sonner";

// Lightweight dedupe wrapper around Sonner: suppresses identical messages
// fired within a short window to keep the UI calm under rapid mutations.

const recent = new Map<string, number>();
const WINDOW_MS = 1500;

function makeKey(type: string, message: unknown, opts?: ExternalToast) {
  const id = opts?.id != null ? String(opts.id) : "";
  const desc = typeof opts?.description === "string" ? opts.description : "";
  return `${type}:${id}:${String(message)}:${desc}`;
}

function shouldEmit(key: string) {
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < WINDOW_MS) return false;
  recent.set(key, now);
  if (recent.size > 64) {
    for (const [k, ts] of recent) if (now - ts > WINDOW_MS * 4) recent.delete(k);
  }
  return true;
}

function wrap(type: string, fn: (msg: any, opts?: ExternalToast) => string | number) {
  return (msg: any, opts?: ExternalToast) => {
    if (!shouldEmit(makeKey(type, msg, opts))) return undefined as unknown as string | number;
    return fn(msg, opts);
  };
}

const anyToast = sonnerToast as any;

const dedup = wrap("default", sonnerToast as unknown as (msg: any, opts?: ExternalToast) => string | number);

export const toast = Object.assign(dedup, {
  success: wrap("success", anyToast.success),
  error: wrap("error", anyToast.error),
  message: wrap("message", anyToast.message),
  info: wrap("info", anyToast.info ?? anyToast.message),
  warning: wrap("warning", anyToast.warning ?? anyToast.message),
  loading: anyToast.loading,
  dismiss: anyToast.dismiss,
  promise: anyToast.promise,
  custom: anyToast.custom,
});