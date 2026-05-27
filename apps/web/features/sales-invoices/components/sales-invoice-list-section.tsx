"use client";

import { useSearchParams } from "next/navigation";
import type { SalesInvoiceListItem } from "./sales-invoice-list";
import { SalesInvoiceCards } from "./sales-invoice-cards";
import { SalesInvoiceTable } from "./sales-invoice-table";

export function SalesInvoiceListSection({
  invoices,
  projectId,
}: {
  invoices: SalesInvoiceListItem[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") {
    return <SalesInvoiceCards invoices={invoices} projectId={projectId} />;
  }
  return <SalesInvoiceTable invoices={invoices} projectId={projectId} />;
}
