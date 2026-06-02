import { SubscriptionOverrideCard } from "@/components/admin/billing/SubscriptionOverrideCard";
import { RefundCreditPanel } from "@/components/admin/billing/RefundCreditPanel";
import { BillingLedgerTable } from "@/components/admin/billing/BillingLedgerTable";
import { InvoicesPanel } from "@/components/admin/billing/InvoicesPanel";

export function BillingTab({
  tenantId,
  activeSub,
  proofs,
  creditBalanceUsd,
}: {
  tenantId: string;
  activeSub: any;
  proofs: any[];
  creditBalanceUsd: number;
}) {
  return (
    <>
      <SubscriptionOverrideCard tenantId={tenantId} subscription={activeSub} />
      <RefundCreditPanel tenantId={tenantId} proofs={proofs} creditBalanceUsd={creditBalanceUsd} />
      <InvoicesPanel proofs={proofs} />
      <BillingLedgerTable tenantId={tenantId} />
    </>
  );
}

export default BillingTab;
