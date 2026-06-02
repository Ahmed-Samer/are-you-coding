// Server-only invoice PDF document.
// Imported exclusively from billing-admin.functions.ts (server).
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export type InvoiceData = {
  invoiceNumber: string;
  issuedAt: string; // ISO
  tenant: { name: string; slug: string };
  plan: { name: string; interval: string };
  paymentMethod: { label: string; kind: string } | null;
  referenceNumber: string;
  amountUsd: number;
  amountEgp: number | null;
  fxRate: number | null;
  periodStart: string | null;
  periodEnd: string | null;
};

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: "#111" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  brand: { fontSize: 22, fontWeight: 700, color: "#0F172A" },
  brandSub: { fontSize: 10, color: "#64748B", marginTop: 4 },
  invoiceBlock: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 16, fontWeight: 700, color: "#0F172A" },
  invoiceMeta: { fontSize: 10, color: "#475569", marginTop: 4 },
  sectionRow: { flexDirection: "row", marginBottom: 28 },
  sectionCol: { flex: 1 },
  sectionLabel: {
    fontSize: 9,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  sectionValue: { fontSize: 11, color: "#0F172A" },
  table: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E2E8F0" },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  th: { fontSize: 9, color: "#64748B", textTransform: "uppercase", paddingHorizontal: 8 },
  tr: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#F1F5F9" },
  td: { fontSize: 11, color: "#0F172A", paddingHorizontal: 8 },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colAmount: { flex: 1.2, textAlign: "right" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  totalsBox: { width: 220 },
  totalsLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalsLabel: { fontSize: 11, color: "#475569" },
  totalsValue: { fontSize: 11, color: "#0F172A" },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderColor: "#0F172A",
  },
  grandLabel: { fontSize: 12, fontWeight: 700, color: "#0F172A" },
  grandValue: { fontSize: 12, fontWeight: 700, color: "#0F172A" },
  footer: {
    marginTop: 48,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#E2E8F0",
    fontSize: 9,
    color: "#94A3B8",
    textAlign: "center",
  },
});

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const periodLabel =
    data.periodStart && data.periodEnd
      ? `${fmtDate(data.periodStart)} → ${fmtDate(data.periodEnd)}`
      : data.plan.interval;
  const lineDesc = `${data.plan.name} subscription (${data.plan.interval}) — ${periodLabel}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>RentWebify</Text>
            <Text style={styles.brandSub}>Receipt of payment</Text>
          </View>
          <View style={styles.invoiceBlock}>
            <Text style={styles.invoiceTitle}>Invoice {data.invoiceNumber}</Text>
            <Text style={styles.invoiceMeta}>Issued {fmtDate(data.issuedAt)}</Text>
            <Text style={styles.invoiceMeta}>Ref {data.referenceNumber}</Text>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.sectionCol}>
            <Text style={styles.sectionLabel}>Billed to</Text>
            <Text style={styles.sectionValue}>{data.tenant.name}</Text>
            <Text style={styles.sectionValue}>{data.tenant.slug}</Text>
          </View>
          <View style={styles.sectionCol}>
            <Text style={styles.sectionLabel}>Payment method</Text>
            <Text style={styles.sectionValue}>
              {data.paymentMethod?.label ?? "—"}
            </Text>
            <Text style={styles.sectionValue}>{data.paymentMethod?.kind ?? ""}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.colDesc]}>{lineDesc}</Text>
            <Text style={[styles.td, styles.colQty]}>1</Text>
            <Text style={[styles.td, styles.colAmount]}>{fmtUsd(data.amountUsd)}</Text>
          </View>
        </View>

        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsLine}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{fmtUsd(data.amountUsd)}</Text>
            </View>
            {data.amountEgp != null && data.fxRate != null ? (
              <View style={styles.totalsLine}>
                <Text style={styles.totalsLabel}>EGP equivalent</Text>
                <Text style={styles.totalsValue}>
                  EGP {data.amountEgp.toFixed(2)} @ {data.fxRate.toFixed(2)}
                </Text>
              </View>
            ) : null}
            <View style={styles.grandTotal}>
              <Text style={styles.grandLabel}>Total paid</Text>
              <Text style={styles.grandValue}>{fmtUsd(data.amountUsd)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Thank you for your business. This receipt confirms payment received for the
          subscription period above. Questions? Reply to your account email.
        </Text>
      </Page>
    </Document>
  );
}