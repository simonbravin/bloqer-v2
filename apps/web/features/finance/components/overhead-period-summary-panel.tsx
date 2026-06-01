"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OverheadPeriodSummary } from "@bloqer/services";
import {
  closeOverheadPeriodAction,
  reopenOverheadPeriodAction,
} from "@/app/(app)/finanzas/gastos-generales/actions";
import { Button } from "@/components/ui/button";
import { DataTableSection } from "@/components/ui/data-table-section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatDate } from "@/lib/format";

type Props = {
  companyId: string;
  periods: OverheadPeriodSummary[];
  canEdit: boolean;
};

export function OverheadPeriodSummaryPanel({ companyId, periods, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runPeriodAction(
    period: string,
    action: "close" | "reopen",
  ) {
    startTransition(async () => {
      setError(null);
      const res =
        action === "close"
          ? await closeOverheadPeriodAction({ companyId, period })
          : await reopenOverheadPeriodAction({ companyId, period });
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  if (periods.length === 0) return null;

  return (
    <DataTableSection
      title="Resumen por período (imputación automática)"
      description="El prorrateo a obra es por mes (sin proyectos en borrador). Cerrá el período para fijar montos en margen; un proyecto nuevo no altera períodos ya cerrados."
    >
      {error ? (
        <p className="text-sm text-destructive mb-3">{error}</p>
      ) : null}
      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Pool (ARS)</TableHead>
              <TableHead className="text-right">CD total (ARS)</TableHead>
              <TableHead className="text-right">Obras</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((p) => (
              <TableRow key={p.period}>
                <TableCell className="font-mono text-sm">{p.period}</TableCell>
                <TableCell>
                  {p.status === "FROZEN" ? (
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Cerrado
                      {p.frozenAt ? (
                        <span className="block font-normal text-muted-foreground">
                          {formatDate(p.frozenAt.slice(0, 10))}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                      Abierto (vista previa)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoneyAmount(p.poolArs, "ARS")}
                  {p.status === "OPEN" && p.invoiceCount > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      {p.invoiceCount} factura(s)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoneyAmount(p.totalCdArs, "ARS")}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.projectRowCount}</TableCell>
                <TableCell className="text-right">
                  {canEdit ? (
                    p.status === "FROZEN" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => runPeriodAction(p.period, "reopen")}
                      >
                        Reabrir
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => runPeriodAction(p.period, "close")}
                      >
                        Cerrar período
                      </Button>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
    </DataTableSection>
  );
}
