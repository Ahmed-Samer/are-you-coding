import { useEffect, useRef, useState } from "react";

/**
 * Lightweight IntersectionObserver hook. Returns a ref to attach and a
 * boolean that flips to `true` once the element first enters the viewport
 * (and stays true thereafter — used for "mount once" lazy rendering).
 */
export function useInView<T extends Element>(
  options: IntersectionObserverInit = { rootMargin: "200px" },
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
          break;
        }
      }
    }, options);
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, options]);

  return { ref, inView };
}