import { useEffect, useState } from "react";

const STORAGE_KEY = "exit-intent-seen";
const SCROLL_DEPTH_THRESHOLD = 0.6;
const IDLE_MS_THRESHOLD = 30_000;

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Cross-device intent trigger:
 *   - Pointer (desktop): top-edge mouseout (classic exit-intent).
 *   - Touch / coarse pointer: scroll depth >= 60% OR idle >= 30s after scroll.
 *
 * Returns `true` once per session, then stays `true`. Caller controls the UI.
 */
export function useIntentTrigger(): boolean {
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (alreadySeen()) return;

    let cancelled = false;
    const fire = () => {
      if (cancelled) return;
      cancelled = true;
      markSeen();
      setFired(true);
    };

    const coarse = window.matchMedia("(pointer: coarse)").matches;

    if (!coarse) {
      const onMouseOut = (e: MouseEvent) => {
        if (e.clientY <= 0) fire();
      };
      document.addEventListener("mouseout", onMouseOut);
      return () => {
        cancelled = true;
        document.removeEventListener("mouseout", onMouseOut);
      };
    }

    // Touch path: scroll depth + idle timer (reset by any scroll).
    let ticking = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(fire, IDLE_MS_THRESHOLD);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const max = Math.max(1, doc.scrollHeight - window.innerHeight);
        const depth = window.scrollY / max;
        if (depth >= SCROLL_DEPTH_THRESHOLD) {
          fire();
        } else {
          resetIdleTimer();
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    resetIdleTimer();
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  return fired;
}

/** Honors prefers-reduced-motion at runtime. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}