"use client";

import { useSearchParams } from "next/navigation";
import type { PurchaseReceiptListItem } from "./purchase-receipt-list";
import { PurchaseReceiptCards } from "./purchase-receipt-cards";
import { PurchaseReceiptTable } from "./purchase-receipt-table";

export function PurchaseReceiptListSection({
  receipts,
  projectId,
}: {
  receipts: PurchaseReceiptListItem[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") {
    return <PurchaseReceiptCards receipts={receipts} projectId={projectId} />;
  }
  return <PurchaseReceiptTable receipts={receipts} projectId={projectId} />;
}
