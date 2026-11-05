"use client";

import type { WarehouseView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { WarehouseCards } from "./warehouse-cards";
import { WarehouseTable } from "./warehouse-table";

export function WarehouseListSection({
  warehouses,
  canCreate = false,
}: {
  warehouses: WarehouseView[];
  canCreate?: boolean;
}) {
  const view = useListViewMode();
  if (view === "cards") return <WarehouseCards warehouses={warehouses} canCreate={canCreate} />;
  return <WarehouseTable warehouses={warehouses} canCreate={canCreate} />;
}
