// Server-only timing helper. Wraps an async handler and logs a structured
// warning when execution exceeds the slow-query threshold. Used to capture
// p50/p95 baselines for hot server functions without pulling in an APM SDK.
//
// Usage:
//   .handler(withTiming("getStorefront", async ({ data }) => { ... }))

const SLOW_MS = 100;

type AnyHandler<TArgs extends any[], TRet> = (...args: TArgs) => Promise<TRet>;

export function withTiming<TArgs extends any[], TRet>(
  name: string,
  handler: AnyHandler<TArgs, TRet>,
): AnyHandler<TArgs, TRet> {
  return async (...args: TArgs): Promise<TRet> => {
    const start = Date.now();
    try {
      return await handler(...args);
    } finally {
      const duration = Date.now() - start;
      if (duration >= SLOW_MS) {
        // Structured single-line log — easy to grep + ship to log aggregator later.
        console.warn(
          JSON.stringify({
            tag: "SLOW_FN",
            fn: name,
            ms: duration,
            threshold: SLOW_MS,
            at: new Date().toISOString(),
          }),
        );
      }
    }
  };
}
