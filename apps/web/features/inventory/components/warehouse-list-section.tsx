"use client";

import type { WarehouseView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { WarehouseCards } from "./warehouse-cards";
import { WarehouseTable } from "./warehouse-table";

export function WarehouseListSection({ warehouses }: { warehouses: WarehouseView[] }) {
  const view = useListViewMode();
  if (view === "cards") return <WarehouseCards warehouses={warehouses} />;
  return <WarehouseTable warehouses={warehouses} />;
}
