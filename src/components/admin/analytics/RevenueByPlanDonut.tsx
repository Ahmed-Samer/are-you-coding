import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function RevenueByPlanDonut({
  data,
}: {
  data: Array<{ plan: string; interval: string; usd: number; proofs: number }>;
}) {
  const total = data.reduce((s, d) => s + d.usd, 0);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Revenue by plan</h2>
        <span className="text-xs text-muted-foreground">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} total</span>
      </div>
      {data.length === 0 ? (
        <div className="h-64 grid place-items-center text-sm text-muted-foreground">No revenue in window.</div>
      ) : (
        <div className="h-64 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="usd" nameKey="plan" innerRadius={50} outerRadius={90} stroke="hsl(var(--card))">
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any, n: any) => [`$${Number(v).toLocaleString()}`, n]}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="space-y-1.5 text-xs min-w-40">
            {data.map((d, i) => (
              <li key={d.plan + d.interval} className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="flex-1 truncate">{d.plan} <span className="text-muted-foreground">({d.interval})</span></span>
                <span className="tabular-nums">${d.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}