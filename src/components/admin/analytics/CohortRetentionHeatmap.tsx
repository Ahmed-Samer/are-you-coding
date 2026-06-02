type Cohort = {
  cohortWeek: string;
  size: number;
  retention: Array<{ offset: number; count: number; pct: number }>;
};

function cellBg(pct: number) {
  if (pct <= 0) return "transparent";
  // Mix primary token by retention pct (clamped 8–95%) so 0% is invisible
  // and 100% is saturated. Uses oklch for perceptual smoothness.
  const mix = Math.min(95, Math.max(8, pct));
  return `color-mix(in oklch, hsl(var(--primary)) ${mix}%, transparent)`;
}

export function CohortRetentionHeatmap({ cohorts, weeks }: { cohorts: Cohort[]; weeks: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Cohort retention</h2>
        <span className="text-xs text-muted-foreground">% of signup-week tenants active in subsequent weeks</span>
      </div>
      {cohorts.length === 0 ? (
        <div className="h-32 grid place-items-center text-sm text-muted-foreground">No cohorts in window.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-muted-foreground font-medium px-2">Cohort</th>
                <th className="text-right text-muted-foreground font-medium px-2">Size</th>
                {Array.from({ length: weeks }, (_, i) => (
                  <th key={i} className="text-center text-muted-foreground font-medium w-10">W{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohortWeek}>
                  <td className="px-2 font-mono">{c.cohortWeek}</td>
                  <td className="px-2 text-right tabular-nums text-muted-foreground">{c.size}</td>
                  {c.retention.map((r) => (
                    <td
                      key={r.offset}
                      title={`${r.count} of ${c.size} active (${r.pct.toFixed(1)}%)`}
                      className="w-10 h-8 text-center rounded-md tabular-nums"
                      style={{
                        background: cellBg(r.pct),
                        color: r.pct > 55 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                      }}
                    >
                      {r.pct > 0 ? `${r.pct.toFixed(0)}%` : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}