"use client";

import type { PurchaseOrderListItem } from "./purchase-order-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { PurchaseOrderCards } from "./purchase-order-cards";
import { PurchaseOrderTable } from "./purchase-order-table";

export function PurchaseOrderListSection({
  orders,
  projectId,
}: {
  orders: PurchaseOrderListItem[];
  projectId: string;
}) {
  const view = useListViewMode();
  if (view === "cards") return <PurchaseOrderCards orders={orders} projectId={projectId} />;
  return <PurchaseOrderTable orders={orders} projectId={projectId} />;
}
