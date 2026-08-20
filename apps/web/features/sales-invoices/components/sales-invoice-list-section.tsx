"use client";

import type { SalesInvoiceListItem } from "./sales-invoice-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { SalesInvoiceCards } from "./sales-invoice-cards";
import { SalesInvoiceTable } from "./sales-invoice-table";

export function SalesInvoiceListSection({
  invoices,
  projectId,
}: {
  invoices: SalesInvoiceListItem[];
  projectId: string;
}) {
  const view = useListViewMode();
  if (view === "cards") {
    return <SalesInvoiceCards invoices={invoices} projectId={projectId} />;
  }
  return <SalesInvoiceTable invoices={invoices} projectId={projectId} />;
}
