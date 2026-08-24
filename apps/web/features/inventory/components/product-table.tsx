import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableNameCellClass,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import type { ProductView } from "@bloqer/services";
import { ProductStatusBadge } from "./product-status-badge";

export function ProductTable({ products }: { products: ProductView[] }) {
  if (products.length === 0) {
    return (
      <ListEmptyState
        title="Sin productos"
        description="Registrá el catálogo para controlar stock y consumos."
        action={
          <Button asChild size="sm">
            <Link href="/inventario/productos/nuevo">Nuevo producto</Link>
          </Button>
        }
      />
    );
  }

  return (
    <TableScroll stickyFirstColumn>
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
              <TableCell className={cn(tableNameCellClass, "font-medium")} title={p.name}>
                {p.name}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.unit || "—"}</TableCell>
              <TableCell
                className="max-w-[8rem] truncate text-sm text-muted-foreground"
                title={p.category || undefined}
              >
                {p.category || "—"}
              </TableCell>
              <TableCell>
                <ProductStatusBadge status={p.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
