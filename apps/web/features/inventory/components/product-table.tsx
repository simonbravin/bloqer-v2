import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { ProductView } from "@bloqer/services";
import { ProductStatusBadge } from "./product-status-badge";

export function ProductTable({ products }: { products: ProductView[] }) {
  if (products.length === 0) {
    return <ListEmptyState message="No hay productos registrados." />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-sm">
                <Link href={`/inventario/productos/${p.id}`} className="text-primary hover:underline">
                  {p.sku}
                </Link>
              </TableCell>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.unit || "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.category || "—"}</TableCell>
              <TableCell>
                <ProductStatusBadge status={p.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
