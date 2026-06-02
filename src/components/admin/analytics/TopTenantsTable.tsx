import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  totalUsd: number;
  proofCount: number;
  lastPaymentAt: string;
};

export function TopTenantsTable({ tenants }: { tenants: TenantRow[] }) {
  const max = Math.max(1, ...tenants.map((t) => t.totalUsd));
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold">Top tenants by revenue</h2>
        <span className="text-xs text-muted-foreground">{tenants.length} tenants</span>
      </div>
      {tenants.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No paid tenants in window.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Proofs</TableHead>
              <TableHead className="w-[40%]">Revenue (USD)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <Link to="/admin/tenants/$tenantId" params={{ tenantId: t.id }} className="hover:underline">
                    {t.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">/{t.slug}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={t.status === "active" ? "default" : "secondary"} className="capitalize">{t.status}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.proofCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(t.totalUsd / max) * 100}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-sm w-20 text-right">
                      ${t.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}