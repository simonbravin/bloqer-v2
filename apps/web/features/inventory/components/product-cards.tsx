import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { ProductView } from "@bloqer/services";
import { ProductStatusBadge } from "./product-status-badge";

export function ProductCards({ products }: { products: ProductView[] }) {
  if (products.length === 0) {
    return <ListEmptyState message="No hay productos registrados." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {products.map((p) => (
        <Link
          key={p.id}
          href={`/inventario/productos/${p.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
            <ProductStatusBadge status={p.status} />
          </div>
          <h3 className="mt-2 line-clamp-2 font-semibold">{p.name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {[p.category, p.unit].filter(Boolean).join(" · ") || "—"}
          </p>
        </Link>
      ))}
    </div>
  );
}
