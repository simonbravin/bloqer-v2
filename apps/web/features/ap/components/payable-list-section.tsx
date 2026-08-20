"use client";

import type { PayableListItem } from "./payable-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { PayableCards } from "./payable-cards";
import { PayableTable } from "./payable-table";

export function PayableListSection({
  payables,
  hrefPrefix,
  supplierInvoiceHrefPrefix,
}: {
  payables: PayableListItem[];
  hrefPrefix: string;
  supplierInvoiceHrefPrefix?: string;
}) {
  const view = useListViewMode();
  if (view === "cards") {
    return (
      <PayableCards
        payables={payables}
        hrefPrefix={hrefPrefix}
        supplierInvoiceHrefPrefix={supplierInvoiceHrefPrefix}
      />
    );
  }
  return (
    <PayableTable
      payables={payables}
      hrefPrefix={hrefPrefix}
      supplierInvoiceHrefPrefix={supplierInvoiceHrefPrefix}
    />
  );
}
