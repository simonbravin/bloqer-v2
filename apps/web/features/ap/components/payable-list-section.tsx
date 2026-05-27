"use client";

import { useSearchParams } from "next/navigation";
import type { PayableListItem } from "./payable-list";
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
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
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
