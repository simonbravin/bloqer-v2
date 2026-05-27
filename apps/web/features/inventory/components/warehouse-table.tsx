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
import { TableScroll } from "@/components/ui/table-scroll";
import type { WarehouseView } from "@bloqer/services";
import { WarehouseStatusBadge } from "./warehouse-status-badge";

const TYPE_LABELS: Record<string, string> = {
  CENTRAL: "Central",
  PROJECT: "Proyecto",
  TEMPORARY: "Temporal",
  OTHER: "Otro",
};

export function WarehouseTable({ warehouses }: { warehouses: WarehouseView[] }) {
  if (warehouses.length === 0) {
    return <ListEmptyState message="No hay depósitos registrados." />;
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {warehouses.map((w) => (
            <TableRow key={w.id}>
              <TableCell className="font-medium">
                <Link href={`/inventario/depositos/${w.id}`} className="text-primary hover:underline">
                  {w.name}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {TYPE_LABELS[w.type] ?? w.type}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{w.address || "—"}</TableCell>
              <TableCell>
                <WarehouseStatusBadge status={w.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
