"use client";

import type { ProductView } from "@bloqer/services";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { ProductCards } from "./product-cards";
import { ProductTable } from "./product-table";

export function ProductListSection({ products }: { products: ProductView[] }) {
  const view = useListViewMode();
  if (view === "cards") return <ProductCards products={products} />;
  return <ProductTable products={products} />;
}
