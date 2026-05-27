"use client";

import { useSearchParams } from "next/navigation";
import type { WarehouseView } from "@bloqer/services";
import { WarehouseCards } from "./warehouse-cards";
import { WarehouseTable } from "./warehouse-table";

export function WarehouseListSection({ warehouses }: { warehouses: WarehouseView[] }) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <WarehouseCards warehouses={warehouses} />;
  return <WarehouseTable warehouses={warehouses} />;
}
