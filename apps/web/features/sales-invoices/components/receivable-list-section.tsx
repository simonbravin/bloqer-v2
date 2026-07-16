"use client";

import { useSearchParams } from "next/navigation";
import type { ReceivableListItem } from "./receivable-list";
import { ReceivableCards } from "./receivable-cards";
import { ReceivableTable } from "./receivable-table";

export function ReceivableListSection({
  receivables,
  showProjectColumn = false,
  invoicesHref,
  invoicesActionLabel,
}: {
  receivables: ReceivableListItem[];
  showProjectColumn?: boolean;
  invoicesHref?: string;
  invoicesActionLabel?: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
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
      invoicesHref={invoicesHref}
      invoicesActionLabel={invoicesActionLabel}
    />
  );
}
