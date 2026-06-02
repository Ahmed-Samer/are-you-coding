import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Undo2, BadgeDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { issueRefund, grantCredit } from "@/lib/billing-admin.functions";

type Proof = {
  id: string;
  status: string;
  amount_usd: number | null;
  reference_number: string | null;
  created_at: string;
};

export function RefundCreditPanel({
  tenantId,
  proofs,
  creditBalanceUsd,
}: {
  tenantId: string;
  proofs: Proof[];
  creditBalanceUsd: number;
}) {
  const qc = useQueryClient();
  const refundFn = useServerFn(issueRefund);
  const creditFn = useServerFn(grantCredit);

  const approved = proofs.filter((p) => p.status === "approved");

  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundRef, setRefundRef] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [confirmRefund, setConfirmRefund] = useState(false);

  const [creditAmount, setCreditAmount] = useState(0);
  const [creditReason, setCreditReason] = useState("");
  const [confirmCredit, setConfirmCredit] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "tenant", tenantId] });
    qc.invalidateQueries({ queryKey: ["admin", "billing", tenantId] });
  };

  const refund = useMutation({
    mutationFn: () =>
      refundFn({
        data: {
          proofId: selectedProof!.id,
          amountUsd: refundAmount,
          externalReference: refundRef,
          reason: refundReason,
        },
      }),
    onSuccess: () => {
      toast.success("Refund recorded.");
      setSelectedProof(null);
      setRefundAmount(0);
      setRefundRef("");
      setRefundReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const credit = useMutation({
    mutationFn: () =>
      creditFn({ data: { tenantId, amountUsd: creditAmount, reason: creditReason } }),
    onSuccess: () => {
      toast.success(`Credited $${creditAmount}.`);
      setCreditAmount(0);
      setCreditReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Refund */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Undo2 className="size-4" /> Issue refund
            </h2>
            <p className="text-xs text-muted-foreground">
              Select an approved proof to refund (partial or full).
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border max-h-56 overflow-auto">
          {approved.length === 0 && (
            <li className="px-5 py-6 text-sm text-muted-foreground text-center">
              No approved proofs to refund.
            </li>
          )}
          {approved.map((p) => {
            const selected = selectedProof?.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProof(p);
                    setRefundAmount(Number(p.amount_usd ?? 0));
                  }}
                  className={`w-full text-left px-5 py-3 flex items-center justify-between text-sm hover:bg-muted ${
                    selected ? "bg-muted" : ""
                  }`}
                >
                  <div>
                    <div className="font-medium">${p.amount_usd ?? 0}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {p.reference_number ?? "—"}
                    </div>
                  </div>
                  {selected && <Badge variant="default">Selected</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
        {selectedProof && (
          <div className="p-5 space-y-3 border-t border-border">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount USD</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">External reference</Label>
                <Input
                  value={refundRef}
                  onChange={(e) => setRefundRef(e.target.value)}
                  placeholder="Bank ref / wallet tx id"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (min 10 chars)</Label>
              <Textarea
                rows={2}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="w-full"
              disabled={
                refundAmount <= 0 ||
                !refundRef.trim() ||
                refundReason.trim().length < 10 ||
                refund.isPending
              }
              onClick={() => setConfirmRefund(true)}
            >
              Refund ${refundAmount}
            </Button>
          </div>
        )}
      </div>

      {/* Credit */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BadgeDollarSign className="size-4" /> Grant account credit
            </h2>
            <p className="text-xs text-muted-foreground">
              Credit is consumed against future invoices.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Balance
            </div>
            <div className="text-base font-semibold">
              ${creditBalanceUsd.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Amount USD</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={creditAmount}
              onChange={(e) => setCreditAmount(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (min 10 chars)</Label>
            <Textarea
              rows={3}
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              placeholder="Why is this credit being granted?"
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={
              creditAmount <= 0 || creditReason.trim().length < 10 || credit.isPending
            }
            onClick={() => setConfirmCredit(true)}
          >
            Grant credit
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRefund}
        onOpenChange={setConfirmRefund}
        title={`Refund $${refundAmount} to tenant?`}
        description="This records a negative adjustment and marks the proof as refunded. The action is logged."
        confirmLabel="Issue refund"
        destructive
        confirmationText="REFUND"
        loading={refund.isPending}
        onConfirm={() => {
          refund.mutate();
          setConfirmRefund(false);
        }}
      />

      <ConfirmDialog
        open={confirmCredit}
        onOpenChange={setConfirmCredit}
        title={`Grant $${creditAmount} of credit?`}
        description="This increases the tenant's credit balance and is logged."
        confirmLabel="Grant credit"
        confirmationText="CREDIT"
        loading={credit.isPending}
        onConfirm={() => {
          credit.mutate();
          setConfirmCredit(false);
        }}
      />
    </div>
  );
}
