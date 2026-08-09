"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { PeriodSummary } from "@bloqer/services";
import {
  closeFinancialPeriodAction,
  reopenFinancialPeriodAction,
} from "@/app/(app)/contabilidad/cierres/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  ConfirmAlertDialog,
  ReasonAlertDialog,
} from "@/components/ui/reason-alert-dialog";
import { formatDate } from "@/lib/format";

type Props = {
  companyId: string;
  companyName?: string | null;
  periods: PeriodSummary[];
  canOperate: boolean;
};

export function FinancialPeriodClosePanel({
  companyId,
  companyName,
  periods,
  canOperate,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [closeKey, setCloseKey] = useState<string | null>(null);
  const [reopenKey, setReopenKey] = useState<string | null>(null);

  function runClose(periodKey: string) {
    startTransition(async () => {
      setError(null);
      const res = await closeFinancialPeriodAction({ companyId, periodKey });
      if ("error" in res) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success(`Período ${periodKey} cerrado`);
        setCloseKey(null);
        router.refresh();
      }
    });
  }

  function runReopen(periodKey: string, reason: string) {
    startTransition(async () => {
      setError(null);
      const res = await reopenFinancialPeriodAction({
        companyId,
        periodKey,
        reason,
      });
      if ("error" in res) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success(`Período ${periodKey} reabierto`);
        setReopenKey(null);
        router.refresh();
      }
    });
  }

  const companyHint = companyName ? ` (${companyName})` : "";

  return (
    <DataTableSection
      title="Períodos mensuales"
      description={
        companyName
          ? `Empresa: ${companyName}. Cerrar un mes bloquea tesorería y asientos con fecha en ese rango. Solo OWNER/ADMIN. La reapertura queda auditada.`
          : "Cerrar un mes bloquea movimientos de tesorería y asientos (crear, editar, postear, anular, revertir) con fecha en ese rango. Solo OWNER/ADMIN. La reapertura queda auditada."
      }
    >
      {error ? (
        <p className="text-sm text-destructive mb-3" role="alert">
          {error}
        </p>
      ) : null}

      {periods.length === 0 ? (
        <ListEmptyState
          title="No hay períodos para mostrar"
          description="Aparecen a medida que hay actividad o al cerrar el mes actual."
        />
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.periodKey}>
                  <TableCell className="font-mono text-sm">{p.periodKey}</TableCell>
                  <TableCell className="tabular-nums text-sm">{formatDate(p.startDate)}</TableCell>
                  <TableCell className="tabular-nums text-sm">{formatDate(p.endDate)}</TableCell>
                  <TableCell>
                    {p.status === "CLOSED" ? (
                      <div className="space-y-1">
                        <Badge variant="default">Cerrado</Badge>
                        {p.closedAt ? (
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(p.closedAt.slice(0, 10))}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <Badge variant="secondary">Abierto</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canOperate ? (
                      p.status === "CLOSED" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => setReopenKey(p.periodKey)}
                        >
                          Reabrir
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => setCloseKey(p.periodKey)}
                        >
                          Cerrar
                        </Button>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Solo OWNER/ADMIN</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}

      <ConfirmAlertDialog
        open={closeKey != null}
        onOpenChange={(open) => !open && setCloseKey(null)}
        title={`Cerrar período ${closeKey ?? ""}`}
        description={`¿Cerrar el período ${closeKey}${companyHint}? No se podrán crear, editar ni anular movimientos de tesorería ni asientos contables con fecha en ese mes.`}
        confirmLabel="Cerrar período"
        pending={pending}
        onConfirm={() => {
          if (closeKey) runClose(closeKey);
        }}
      />
      <ReasonAlertDialog
        open={reopenKey != null}
        onOpenChange={(open) => !open && setReopenKey(null)}
        title={`Reabrir período ${reopenKey ?? ""}`}
        description={`Motivo de reapertura del período ${reopenKey} (obligatorio). Queda auditado.`}
        confirmLabel="Reabrir"
        pending={pending}
        onConfirm={(reason) => {
          if (reopenKey) runReopen(reopenKey, reason);
        }}
      />
    </DataTableSection>
  );
}
