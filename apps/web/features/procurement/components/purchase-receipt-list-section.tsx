"use client";

import type { PurchaseReceiptListItem } from "./purchase-receipt-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { PurchaseReceiptCards } from "./purchase-receipt-cards";
import { PurchaseReceiptTable } from "./purchase-receipt-table";

export function PurchaseReceiptListSection({
  receipts,
  projectId,
}: {
  receipts: PurchaseReceiptListItem[];
  projectId: string;
}) {
  const view = useListViewMode();
  if (view === "cards") {
    return <PurchaseReceiptCards receipts={receipts} projectId={projectId} />;
  }
  return <PurchaseReceiptTable receipts={receipts} projectId={projectId} />;
}
