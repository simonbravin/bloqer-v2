"use client";

import { useSearchParams } from "next/navigation";
import type { ProductView } from "@bloqer/services";
import { ProductCards } from "./product-cards";
import { ProductTable } from "./product-table";

export function ProductListSection({ products }: { products: ProductView[] }) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <ProductCards products={products} />;
  return <ProductTable products={products} />;
}
