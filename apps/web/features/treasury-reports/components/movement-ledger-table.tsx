import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import type { MovementReportRow } from "@bloqer/services";
import { treasuryMovementSupportsAccountingDraft } from "@bloqer/services/accounting-treasury-gl-eligibility";
import { TreasuryMovementAccountingButton } from "@/features/accounting";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { cn } from "@/lib/utils";
import { UrlSortableTableHead } from "@/components/ui/url-sortable-table-head";
import { formatMoneyAmount, formatSignedMoneyAmount, signedMoneyAmountToneClass } from "@/lib/format-money";
import { accountMovementStatusLabel } from "@/features/treasury/lib/account-movement-status-label";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { MovementDetailDialog } from "./movement-detail-dialog";

interface Props {
  rows: MovementReportRow[];
  showRunningBalance: boolean;
  showProjectColumn?: boolean;
  /** Hide when the table is already scoped to one account (extracto). */
  showAccountColumn?: boolean;
  canLinkProjects?: boolean;
  accountingReturnPath?: string;
  canEditAccounting?: boolean;
  /** When set, empty state links to help / register (Finanzas → Transacciones). */
  showFinanceEmptyHelp?: boolean;
}

export function MovementLedgerTable({
  rows,
  showRunningBalance,
  showProjectColumn = false,
  showAccountColumn = true,
  canLinkProjects = false,
  accountingReturnPath,
  canEditAccounting,
  showFinanceEmptyHelp = false,
}: Props) {
  const showGl = Boolean(accountingReturnPath && canEditAccounting);
  if (rows.length === 0) {
    if (showFinanceEmptyHelp) {
      return (
        <ListEmptyState
          title="No hay movimientos en este período"
          description="Los egresos e ingresos aparecen al pagar CxP, cobrar CxC o registrar transacciones. Para sueldos: Gasto / factura al empleado."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/finanzas/transacciones?register=ap">Registrar gasto</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/ayuda/pagar-un-sueldo">Cómo pagar un sueldo</Link>
              </Button>
            </div>
          }
        />
      );
    }
    return <ListEmptyState message="No hay movimientos para los filtros seleccionados." />;
  }

  return (
    <TableScroll>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <Suspense fallback={<TableHead className="w-[5.5rem]">Fecha</TableHead>}>
              <UrlSortableTableHead
                label="Fecha"
                defaultDir={showRunningBalance ? "asc" : "desc"}
                className="w-[5.5rem]"
              />
            </Suspense>
            {showAccountColumn && <TableHead className="w-[7.5rem]">Cuenta</TableHead>}
            <TableHead className="w-[8.5rem]">Clase</TableHead>
            <TableHead className="w-[5.5rem]">Estado</TableHead>
            <TableHead className="w-[5.5rem]">Factura</TableHead>
            <TableHead className="w-auto">Descripción</TableHead>
            {showProjectColumn && <TableHead className="w-[6.5rem]">Proyecto</TableHead>}
            <TableHead className="w-12">Mon.</TableHead>
            <TableHead className="w-[6.5rem] text-right">Importe</TableHead>
            {showRunningBalance && <TableHead className="w-[6.5rem] text-right">Saldo</TableHead>}
            {showGl && <TableHead className="w-[4.5rem] text-right">Asiento</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">
                {formatDate(m.movementDate)}
              </TableCell>
              {showAccountColumn && (
                <TableCell className="text-muted-foreground text-xs">
                  <span className="block truncate" title={m.accountName}>
                    {m.accountName}
                  </span>
                </TableCell>
              )}
              <TableCell className="min-w-0 overflow-hidden">
                {m.classLabel ? (
                  <DocumentClassBadge
                    classLabel={m.classLabel}
                    classFamily={m.classFamily}
                    className="min-w-0 max-w-full"
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                <span className="block truncate" title={accountMovementStatusLabel(m.status)}>
                  {accountMovementStatusLabel(m.status)}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums font-mono">
                {m.documentRef ? (
                  <span className="block truncate" title={m.documentRef}>
                    {m.documentRef}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className={cn("max-w-0 w-full", "text-muted-foreground")}>
                <MovementDetailDialog row={m} canLinkProjects={canLinkProjects} />
              </TableCell>
              {showProjectColumn && (
                <TableCell className="text-muted-foreground text-xs">
                  {m.projectId && canLinkProjects ? (
                    <Link
                      href={`/proyectos/${m.projectId}`}
                      className="block truncate underline underline-offset-2 hover:text-foreground"
                      title={m.projectName ?? m.projectId}
                    >
                      {m.projectName ?? m.projectId}
                    </Link>
                  ) : m.projectId ? (
                    <span className="block truncate" title={m.projectName ?? undefined}>
                      {m.projectName ?? "Obra"}
                    </span>
                  ) : (
                    "Empresa"
                  )}
                </TableCell>
              )}
              <TableCell className="text-xs text-muted-foreground">{m.currency}</TableCell>
              <TableCell
                className={cn(
                  "text-right text-xs tabular-nums font-mono whitespace-nowrap",
                  signedMoneyAmountToneClass(m.signedAmount),
                )}
              >
                {formatSignedMoneyAmount(m.signedAmount)}
              </TableCell>
              {showRunningBalance && (
                <TableCell className="text-right text-xs tabular-nums font-mono text-muted-foreground whitespace-nowrap">
                  {m.runningBalance != null && m.runningBalance !== ""
                    ? formatMoneyAmount(m.runningBalance)
                    : "—"}
                </TableCell>
              )}
              {showGl && (
                <TableCell className="text-right">
                  {treasuryMovementSupportsAccountingDraft({
                    type: m.type,
                    sourceType: m.sourceType,
                  }) && accountingReturnPath ? (
                    <TreasuryMovementAccountingButton
                      movementId={m.id}
                      returnPath={accountingReturnPath}
                      label="GL"
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
