"use client";

import { useSearchParams } from "next/navigation";
import type { SupplierInvoiceListItem } from "./supplier-invoice-list";
import { SupplierInvoiceCards } from "./supplier-invoice-cards";
import { SupplierInvoiceTable } from "./supplier-invoice-table";

export function SupplierInvoiceListSection({
  invoices,
  hrefPrefix,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") {
    return <SupplierInvoiceCards invoices={invoices} hrefPrefix={hrefPrefix} />;
  }
  return <SupplierInvoiceTable invoices={invoices} hrefPrefix={hrefPrefix} />;
}
