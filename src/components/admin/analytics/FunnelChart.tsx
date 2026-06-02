import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Stage = {
  key: string;
  label: string;
  count: number;
  conversionFromTop: number;
  conversionFromPrev: number;
};

export function FunnelChart({ stages }: { stages: Stage[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Conversion funnel</h2>
        <span className="text-xs text-muted-foreground">cumulative tenants per stage</span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stages} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis type="category" dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" width={110} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(v: any, _n, item: any) =>
                [`${v} tenants — ${item?.payload?.conversionFromTop?.toFixed(1)}% of top`, item?.payload?.label]
              }
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]}>
              <LabelList
                dataKey="conversionFromPrev"
                position="right"
                formatter={(v: any) => `${Number(v).toFixed(0)}%`}
                style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}