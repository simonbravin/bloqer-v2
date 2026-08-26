import Link from "next/link";
import type { PurchaseOrderVarianceRow } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatRatePctWithSymbol, formatUnitPriceFromString, variancePctTone } from "@/lib/format-money";
import { purchaseVarianceTierLabel } from "@/features/procurement/lib/variance-tier-labels";
import { cn } from "@/lib/utils";

export function PurchaseOrderVarianceTable({
  rows,
  projectId,
}: {
  rows: PurchaseOrderVarianceRow[];
  projectId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No hay líneas de OC con desvío presupuestario registrado en el período filtrado.
      </p>
    );
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>OC</TableHead>
            <TableHead>Línea</TableHead>
            <TableHead>EDT</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">Desvío %</TableHead>
            <TableHead className="text-right">P. unit.</TableHead>
            <TableHead className="text-right">Desc. %</TableHead>
            <TableHead className="text-right">Presup.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.lineId}>
              <TableCell>
                <Link
                  href={`/proyectos/${projectId}/ordenes-compra/${r.purchaseOrderId}`}
                  className="font-medium hover:underline"
                >
                  {r.purchaseOrderCode}
                </Link>
              </TableCell>
              <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{r.wbsCode ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {r.varianceTier === "UNIT_MISMATCH" || r.varianceTier === "NO_BUDGET_BASELINE"
                  ? purchaseVarianceTierLabel(r.varianceTier)
                  : (r.varianceJustification ?? "—")}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums font-medium",
                  variancePctTone(r.variancePct) === "success" && "text-emerald-600 dark:text-emerald-400",
                  variancePctTone(r.variancePct) === "danger" && "text-destructive",
                )}
              >
                {r.variancePct != null ? formatRatePctWithSymbol(r.variancePct) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatUnitPriceFromString(r.unitPrice)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRatePctWithSymbol(r.discountPct)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.budgetUnitCostSnapshot ? formatUnitPriceFromString(r.budgetUnitCostSnapshot) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
