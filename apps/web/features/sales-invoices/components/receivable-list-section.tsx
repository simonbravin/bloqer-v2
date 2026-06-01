"use client";

import { useSearchParams } from "next/navigation";
import type { ReceivableListItem } from "./receivable-list";
import { ReceivableCards } from "./receivable-cards";
import { ReceivableTable } from "./receivable-table";

export function ReceivableListSection({
  receivables,
  showProjectColumn = false,
}: {
  receivables: ReceivableListItem[];
  showProjectColumn?: boolean;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") {
    return <ReceivableCards receivables={receivables} showProjectColumn={showProjectColumn} />;
  }
  return (
    <ReceivableTable receivables={receivables} showProjectColumn={showProjectColumn} />
  );
}
