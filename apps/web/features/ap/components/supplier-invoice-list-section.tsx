"use client";

import { useSearchParams } from "next/navigation";
import type { SupplierInvoiceListItem } from "./supplier-invoice-list";
import { SupplierInvoiceCards } from "./supplier-invoice-cards";
import { SupplierInvoiceTable } from "./supplier-invoice-table";

export function SupplierInvoiceListSection({
  invoices,
  hrefPrefix,
  payableHrefPrefix,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
  payableHrefPrefix?: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") {
    return (
      <SupplierInvoiceCards
        invoices={invoices}
        hrefPrefix={hrefPrefix}
        payableHrefPrefix={payableHrefPrefix}
      />
    );
  }
  return (
    <SupplierInvoiceTable
      invoices={invoices}
      hrefPrefix={hrefPrefix}
      payableHrefPrefix={payableHrefPrefix}
    />
  );
}
