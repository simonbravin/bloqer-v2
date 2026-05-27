"use client";

import { useSearchParams } from "next/navigation";
import type { PurchaseOrderListItem } from "./purchase-order-list";
import { PurchaseOrderCards } from "./purchase-order-cards";
import { PurchaseOrderTable } from "./purchase-order-table";

export function PurchaseOrderListSection({
  orders,
  projectId,
}: {
  orders: PurchaseOrderListItem[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <PurchaseOrderCards orders={orders} projectId={projectId} />;
  return <PurchaseOrderTable orders={orders} projectId={projectId} />;
}
