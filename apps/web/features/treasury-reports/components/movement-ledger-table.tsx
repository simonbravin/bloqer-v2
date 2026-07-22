import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { MovementReportRow } from "@bloqer/services";
import { TreasuryMovementAccountingButton } from "@/features/accounting";
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
import { formatMoneyAmount } from "@/lib/format-money";

function treasuryMovementTypeSupportsAccountingDraft(type: string): boolean {
  return type === "INFLOW" || type === "OUTFLOW" || type === "TRANSFER_IN" || type === "TRANSFER_OUT";
}

const TYPE_LABELS: Record<string, string> = {
  INFLOW: "Ingreso",
  OUTFLOW: "Egreso",
  TRANSFER_IN: "Transferencia entrada",
  TRANSFER_OUT: "Transferencia salida",
  ADJUSTMENT: "Ajuste",
};

function fmtSigned(signed: string) {
  const n = parseFloat(signed);
  return (n >= 0 ? "+" : "") + formatMoneyAmount(signed);
}

interface Props {
  rows: MovementReportRow[];
  showRunningBalance: boolean;
  showProjectColumn?: boolean;
  canLinkProjects?: boolean;
  accountingReturnPath?: string;
  canEditAccounting?: boolean;
}

export function MovementLedgerTable({
  rows,
  showRunningBalance,
  showProjectColumn = false,
  canLinkProjects = false,
  accountingReturnPath,
  canEditAccounting,
}: Props) {
  const showGl = Boolean(accountingReturnPath && canEditAccounting);
  if (rows.length === 0) {
    return <ListEmptyState message="No hay movimientos para los filtros seleccionados." />;
  }

  return (
    <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Contraparte</TableHead>
              <TableHead>Descripción</TableHead>
              {showProjectColumn && <TableHead>Proyecto</TableHead>}
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              {showRunningBalance && <TableHead className="text-right">Saldo</TableHead>}
              {showGl && <TableHead className="text-right">Contabilidad</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const signed = parseFloat(m.signedAmount);
              return (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(m.movementDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{m.accountName}</TableCell>
                  <TableCell>
                    <span className={m.isInternalTransfer ? "text-muted-foreground text-xs" : ""}>
                      {TYPE_LABELS[m.type] ?? m.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{m.sourceLabel}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-muted-foreground text-xs">
                    {m.counterpartyName ? (
                      <span title={m.externalInvoiceRef ?? undefined}>
                        {m.counterpartyName}
                        {m.externalInvoiceRef ? (
                          <span className="block truncate text-[11px] opacity-80">
                            {m.externalInvoiceRef}
                          </span>
                        ) : null}
                      </span>
                    ) : m.externalInvoiceRef ? (
                      <span className="truncate" title={m.externalInvoiceRef}>
                        {m.externalInvoiceRef}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {m.description}
                  </TableCell>
                  {showProjectColumn && (
                    <TableCell className="max-w-[160px] truncate text-muted-foreground text-xs">
                      {m.projectId && canLinkProjects ? (
                        <Link
                          href={`/proyectos/${m.projectId}`}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          {m.projectName ?? m.projectId}
                        </Link>
                      ) : m.projectId ? (
                        (m.projectName ?? "Obra")
                      ) : (
                        "Empresa"
                      )}
                    </TableCell>
                  )}
                  <TableCell>{m.currency}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-mono ${
                      signed >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {fmtSigned(m.signedAmount)}
                  </TableCell>
                  {showRunningBalance && (
                    <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                      {m.runningBalance ? formatMoneyAmount(m.runningBalance) : "—"}
                    </TableCell>
                  )}
                  {showGl && (
                    <TableCell className="text-right">
                      {treasuryMovementTypeSupportsAccountingDraft(m.type) && accountingReturnPath ? (
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
              );
            })}
          </TableBody>
        </Table>
    </TableScroll>
  );
}
