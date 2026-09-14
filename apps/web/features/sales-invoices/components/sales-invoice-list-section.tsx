"use client";

import type { SalesInvoiceListItem } from "./sales-invoice-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { SalesInvoiceCards } from "./sales-invoice-cards";
import { SalesInvoiceTable } from "./sales-invoice-table";

export function SalesInvoiceListSection({
  invoices,
  projectId,
  emptyTitle,
  emptyDescription,
  emptyMessage,
}: {
  invoices: SalesInvoiceListItem[];
  projectId: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyMessage?: string;
}) {
  const view = useListViewMode();
  if (view === "cards") {
    return (
      <SalesInvoiceCards
        invoices={invoices}
        projectId={projectId}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyMessage={emptyMessage}
      />
    );
  }
  return (
    <SalesInvoiceTable
      invoices={invoices}
      projectId={projectId}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyMessage={emptyMessage}
    />
  );
}
