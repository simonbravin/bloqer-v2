"use client";

import Link from "next/link";
import type { CostControlRow, CostControlTotals } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CostVarianceBadge } from "./cost-variance-badge";

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

const COLUMN_HINTS: Record<string, string> = {
  committed:
    "Compromisos firmes: OC confirmadas y subcontratos activos. Aún no necesariamente facturados.",
  received:
    "Recepción física confirmada (cant. × PU de la OC). Informativo; no suma a la exposición.",
  accrued:
    "Obligación reconocida: facturas de proveedor emitidas y certificaciones de subcontrato aprobadas.",
  paid: "Pagos confirmados imputables a esta partida.",
  openCommitted:
    "Comprometido abierto = max(0, Comprometido − Devengado ligado al mismo compromiso). Evita doble conteo OC+factura.",
  exposure:
    "Exposición esperada = Devengado + Comprometido abierto (anti doble conteo). No suma OC + factura en bruto.",
};

function HintHead({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TableHead className="text-right cursor-help underline decoration-dotted decoration-muted-foreground/50">
          {label}
        </TableHead>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

type Props = {
  rows: CostControlRow[];
  totals: CostControlTotals;
  projectId: string;
};

export function CostControlTable({ rows, totals, projectId }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <TableScroll stickyFirstColumn>
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            <TableRow>
              <TableHead className="w-28">EDT</TableHead>
              <TableHead>Ítem</TableHead>
              <TableHead className="text-right">Pres. costo</TableHead>
              <TableHead className="text-right">Pres. venta</TableHead>
              <TableHead className="text-right">Cert. aprobado</TableHead>
              <HintHead label="Comprometido" hint={COLUMN_HINTS.committed!} />
              <HintHead label="Recibido" hint={COLUMN_HINTS.received!} />
              <HintHead label="Devengado" hint={COLUMN_HINTS.accrued!} />
              <HintHead label="Pagado" hint={COLUMN_HINTS.paid!} />
              <HintHead label="Comp. abierto" hint={COLUMN_HINTS.openCommitted!} />
              <HintHead label="Exposición esp." hint={COLUMN_HINTS.exposure!} />
              <TableHead className="text-right">Variación</TableHead>
              <TableHead className="text-right">Avance físico</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.wbsNodeId}
                className={row.flags.overBudget ? "bg-red-50/50 dark:bg-red-950/10" : ""}
              >
                <TableCell className="font-mono font-medium">
                  <Link
                    href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`}
                    className="hover:underline text-primary"
                  >
                    {row.wbsCode}
                  </Link>
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  <Link
                    href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`}
                    className="hover:underline"
                  >
                    {row.wbsName}
                  </Link>
                  {row.flags.missingBudget && (
                    <span className="ml-1 text-yellow-600 text-xs">(sin análisis)</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatAmount(row.budgetTotalCost)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.budgetTotalSale)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(row.certifiedApproved)}
                  {row.flags.overCertified && <span className="ml-1 text-destructive">!</span>}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.committedCost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.receivedCost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.accruedCost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.paidCost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatAmount(row.openCommittedCost)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatAmount(row.expectedCostExposure)}
                </TableCell>
                <TableCell className="text-right">
                  <CostVarianceBadge
                    variance={row.costVariance}
                    label={formatAmount(row.costVariance)}
                  />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {row.operationalProgressQty}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right">{formatAmount(totals.budgetTotalCost)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.budgetTotalSale)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.certifiedApproved)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.committedCost)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.receivedCost)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.accruedCost)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.paidCost)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.openCommittedCost)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.expectedCostExposure)}</TableCell>
              <TableCell className="text-right">{formatAmount(totals.costVariance)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </TableScroll>
    </TooltipProvider>
  );
}
