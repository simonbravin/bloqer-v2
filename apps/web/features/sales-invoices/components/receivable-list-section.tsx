"use client";

import type { ReceivableListItem } from "./receivable-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { ReceivableCards } from "./receivable-cards";
import { ReceivableTable } from "./receivable-table";

export function ReceivableListSection({
  receivables,
  showProjectColumn = false,
  showInvoiceColumn = false,
  canMutate = false,
  invoicesHref,
  invoicesActionLabel,
}: {
  receivables: ReceivableListItem[];
  showProjectColumn?: boolean;
  /** Show FAC-xxxxx column (project lists or company lists with codes). */
  showInvoiceColumn?: boolean;
  /** When true, show Cobrar CTA (requires EDIT AR upstream). */
  canMutate?: boolean;
  invoicesHref?: string;
  invoicesActionLabel?: string;
}) {
  const view = useListViewMode();
  if (view === "cards") {
    return (
      <ReceivableCards
        receivables={receivables}
        showProjectColumn={showProjectColumn}
        invoicesHref={invoicesHref}
        invoicesActionLabel={invoicesActionLabel}
      />
    );
  }
  return (
    <ReceivableTable
      receivables={receivables}
      showProjectColumn={showProjectColumn}
      showInvoiceColumn={showInvoiceColumn || showProjectColumn}
      canMutate={canMutate}
      invoicesHref={invoicesHref}
      invoicesActionLabel={invoicesActionLabel}
    />
  );
}
