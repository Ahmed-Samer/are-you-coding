import { Download } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportAnalyticsDataset } from "@/lib/admin-analytics.functions";

const DATASETS: Array<{ key: "cohort" | "funnel" | "revenue-by-plan" | "revenue-by-method" | "top-tenants"; label: string }> = [
  { key: "cohort", label: "Cohort retention" },
  { key: "funnel", label: "Conversion funnel" },
  { key: "revenue-by-plan", label: "Revenue by plan" },
  { key: "revenue-by-method", label: "Revenue by method" },
  { key: "top-tenants", label: "Top tenants" },
];

function triggerDownload(filename: string, mimeType: string, body: string) {
  const blob = new Blob([body], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportMenu({ days, weeks }: { days: 7 | 30 | 90 | 365; weeks: 8 | 12 | 26 }) {
  const exportFn = useServerFn(exportAnalyticsDataset);

  async function run(dataset: (typeof DATASETS)[number]["key"], format: "csv" | "json") {
    try {
      const res = await exportFn({
        data: {
          dataset,
          format,
          days: String(days) as any,
          weeks: String(weeks) as any,
        },
      });
      triggerDownload(res.filename, res.mimeType, res.body);
      toast.success(`Exported ${res.filename}`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Download dataset</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DATASETS.map((d) => (
          <div key={d.key} className="flex items-center justify-between px-2 py-1.5 text-sm">
            <span className="truncate">{d.label}</span>
            <div className="flex gap-1">
              <button className="text-xs px-1.5 py-0.5 rounded hover:bg-muted" onClick={() => run(d.key, "csv")}>CSV</button>
              <button className="text-xs px-1.5 py-0.5 rounded hover:bg-muted" onClick={() => run(d.key, "json")}>JSON</button>
            </div>
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
          Exports are audit-logged.
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}