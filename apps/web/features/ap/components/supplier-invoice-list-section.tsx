"use client";

import type { SupplierInvoiceListItem } from "./supplier-invoice-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { SupplierInvoiceCards } from "./supplier-invoice-cards";
import { SupplierInvoiceTable } from "./supplier-invoice-table";

export function SupplierInvoiceListSection({
  invoices,
  hrefPrefix,
  payableHrefPrefix,
  canRegisterPayment = false,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
  payableHrefPrefix?: string;
  canRegisterPayment?: boolean;
}) {
  const view = useListViewMode();
  if (view === "cards") {
    return (
      <SupplierInvoiceCards
        invoices={invoices}
        hrefPrefix={hrefPrefix}
        payableHrefPrefix={payableHrefPrefix}
        canRegisterPayment={canRegisterPayment}
      />
    );
  }
  return (
    <SupplierInvoiceTable
      invoices={invoices}
      hrefPrefix={hrefPrefix}
      payableHrefPrefix={payableHrefPrefix}
      canRegisterPayment={canRegisterPayment}
    />
  );
}
