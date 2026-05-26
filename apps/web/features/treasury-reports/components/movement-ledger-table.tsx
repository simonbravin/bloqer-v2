import { formatDate, formatDateTime } from "@/lib/format";
import type { MovementReportRow } from "@bloqer/services";
import { treasuryMovementTypeSupportsAccountingDraft } from "@bloqer/services";
import { TreasuryMovementAccountingButton } from "@/features/accounting";

const TYPE_LABELS: Record<string, string> = {
  INFLOW:       "Ingreso",
  OUTFLOW:      "Egreso",
  TRANSFER_IN:  "Transferencia entrada",
  TRANSFER_OUT: "Transferencia salida",
  ADJUSTMENT:   "Ajuste",
};

function fmtDate(d: string) {
  return formatDate(d );
}

function fmtSigned(signed: string, currency: string) {
  const n = parseFloat(signed);
  return (n >= 0 ? "+" : "") +
    n.toLocaleString("es-AR", { minimumFractionDigits: 2 }) +
    " " + currency;
}

interface Props {
  rows: MovementReportRow[];
  showRunningBalance: boolean;
  /** When set with `canEditAccounting`, shows per-row draft journal action for supported movement types. */
  accountingReturnPath?: string;
  canEditAccounting?: boolean;
}

export function MovementLedgerTable({
  rows,
  showRunningBalance,
  accountingReturnPath,
  canEditAccounting,
}: Props) {
  const showGl = Boolean(accountingReturnPath && canEditAccounting);
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        No hay movimientos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
            <th className="px-4 py-2.5 text-left font-medium">Cuenta</th>
            <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
            <th className="px-4 py-2.5 text-left font-medium">Origen</th>
            <th className="px-4 py-2.5 text-left font-medium">Descripción</th>
            <th className="px-4 py-2.5 text-left font-medium">Moneda</th>
            <th className="px-4 py-2.5 text-right font-medium">Importe</th>
            {showRunningBalance && (
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            )}
            {showGl && (
              <th className="px-4 py-2.5 text-right font-medium">Contabilidad</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const signed = parseFloat(m.signedAmount);
            return (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(m.movementDate)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{m.accountName}</td>
                <td className="px-4 py-2.5">
                  <span className={m.isInternalTransfer ? "text-muted-foreground text-xs" : ""}>
                    {TYPE_LABELS[m.type] ?? m.type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{m.sourceLabel}</td>
                <td className="px-4 py-2.5 max-w-[200px] truncate text-muted-foreground">{m.description}</td>
                <td className="px-4 py-2.5">{m.currency}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${signed >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {fmtSigned(m.signedAmount, "")}
                </td>
                {showRunningBalance && (
                  <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">
                    {m.runningBalance
                      ? parseFloat(m.runningBalance).toLocaleString("es-AR", { minimumFractionDigits: 2 })
                      : "—"}
                  </td>
                )}
                {showGl && (
                  <td className="px-4 py-2.5 text-right">
                    {treasuryMovementTypeSupportsAccountingDraft(m.type) && accountingReturnPath ? (
                      <TreasuryMovementAccountingButton
                        movementId={m.id}
                        returnPath={accountingReturnPath}
                        label="Asiento"
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
