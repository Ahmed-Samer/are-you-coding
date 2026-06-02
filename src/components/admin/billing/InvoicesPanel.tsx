import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateInvoicePdf } from "@/lib/billing-admin.functions";

type Proof = {
  id: string;
  status: string;
  amount_usd: number | null;
  reference_number: string | null;
  created_at: string;
};

export function InvoicesPanel({ proofs }: { proofs: Proof[] }) {
  const genFn = useServerFn(generateInvoicePdf);

  const gen = useMutation({
    mutationFn: (proofId: string) => genFn({ data: { proofId } }),
    onSuccess: (res) => {
      toast.success(
        res.cached ? `Opened invoice ${res.invoiceNumber}` : `Generated ${res.invoiceNumber}`,
      );
      window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approved = proofs.filter((p) => p.status === "approved");

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="size-4" /> Invoices
        </h2>
        <p className="text-xs text-muted-foreground">
          Generate or re-download invoice PDFs for approved payments.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {approved.length === 0 && (
          <li className="px-5 py-6 text-sm text-muted-foreground text-center">
            No approved proofs to invoice.
          </li>
        )}
        {approved.map((p) => {
          const isThis = gen.isPending && gen.variables === p.id;
          return (
            <li
              key={p.id}
              className="px-5 py-3 flex items-center justify-between text-sm"
            >
              <div>
                <div className="font-medium">${p.amount_usd ?? 0}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {p.reference_number ?? "—"} · {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="capitalize">
                  {p.status}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isThis}
                  onClick={() => gen.mutate(p.id)}
                >
                  <Download className="size-3.5" />
                  {isThis ? "Working…" : "Invoice PDF"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
