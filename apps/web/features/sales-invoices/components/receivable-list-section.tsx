"use client";

import { useSearchParams } from "next/navigation";
import type { ReceivableListItem } from "./receivable-list";
import { ReceivableCards } from "./receivable-cards";
import { ReceivableTable } from "./receivable-table";

export function ReceivableListSection({
  receivables,
  projectId,
}: {
  receivables: ReceivableListItem[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <ReceivableCards receivables={receivables} projectId={projectId} />;
  return <ReceivableTable receivables={receivables} projectId={projectId} />;
}
