import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import {
  treasuryMovementSupportsAccountingDraft,
  type MovementReportRow,
} from "@bloqer/services";
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
  tableNameCellClass,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { cn } from "@/lib/utils";
import { UrlSortableTableHead } from "@/components/ui/url-sortable-table-head";
import { formatMoneyAmount, formatSignedMoneyAmount, signedMoneyAmountToneClass } from "@/lib/format-money";
import { accountMovementStatusLabel } from "@/features/treasury/lib/account-movement-status-label";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { MovementDetailDialog } from "./movement-detail-dialog";
import { MOVEMENT_TYPE_LABELS } from "../lib/movement-type-labels";

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
        <Table>
          <TableHeader>
            <TableRow>
              <Suspense fallback={<TableHead>Fecha</TableHead>}>
                <UrlSortableTableHead
                  label="Fecha"
                  defaultDir={showRunningBalance ? "asc" : "desc"}
                />
              </Suspense>
              {showAccountColumn && <TableHead>Cuenta</TableHead>}
              <TableHead>Tipo</TableHead>
              <TableHead>Clase</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="w-full">Descripción</TableHead>
              {showProjectColumn && <TableHead>Proyecto</TableHead>}
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              {showRunningBalance && <TableHead className="text-right">Saldo</TableHead>}
              {showGl && <TableHead className="text-right">Contabilidad</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(m.movementDate)}</TableCell>
                  {showAccountColumn && (
                    <TableCell className="text-muted-foreground">
                      <span className="block w-36 truncate" title={m.accountName}>
                        {m.accountName}
                      </span>
                    </TableCell>
                  )}
                  <TableCell>
                    <span className={m.isInternalTransfer ? "text-muted-foreground text-xs" : ""}>
                      {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    {m.classLabel ? (
                      <DocumentClassBadge
                        classLabel={m.classLabel}
                        classFamily={m.classFamily}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {accountMovementStatusLabel(m.status)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <span className="block w-28 truncate" title={m.sourceLabel}>
                      {m.sourceLabel}
                    </span>
                  </TableCell>
                  <TableCell className={cn(tableNameCellClass, "text-muted-foreground")}>
                    <MovementDetailDialog row={m} canLinkProjects={canLinkProjects} />
                  </TableCell>
                  {showProjectColumn && (
                    <TableCell className="text-muted-foreground text-xs">
                      {m.projectId && canLinkProjects ? (
                        <Link
                          href={`/proyectos/${m.projectId}`}
                          className="block w-36 truncate underline underline-offset-2 hover:text-foreground"
                          title={m.projectName ?? m.projectId}
                        >
                          {m.projectName ?? m.projectId}
                        </Link>
                      ) : m.projectId ? (
                        <span className="block w-36 truncate" title={m.projectName ?? undefined}>
                          {m.projectName ?? "Obra"}
                        </span>
                      ) : (
                        "Empresa"
                      )}
                    </TableCell>
                  )}
                  <TableCell>{m.currency}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-mono",
                      signedMoneyAmountToneClass(m.signedAmount),
                    )}
                  >
                    {formatSignedMoneyAmount(m.signedAmount)}
                  </TableCell>
                  {showRunningBalance && (
                    <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
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
                          label="Asiento"
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
