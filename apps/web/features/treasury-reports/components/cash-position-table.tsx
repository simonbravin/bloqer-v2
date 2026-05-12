import type { CashPositionReport } from "@bloqer/services";

const TYPE_LABELS: Record<string, string> = {
  BANK:           "Banco",
  CASH:           "Caja",
  DIGITAL_WALLET: "Billetera",
  OTHER:          "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:   "Activa",
  INACTIVE: "Inactiva",
  CLOSED:   "Cerrada",
};

function fmt(value: string, currency: string) {
  return (
    parseFloat(value).toLocaleString("es-AR", { minimumFractionDigits: 2 }) +
    " " + currency
  );
}

interface Props {
  report: CashPositionReport;
}

export function CashPositionTable({ report }: Props) {
  if (report.accounts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        No hay cuentas con datos.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards by currency */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {report.byCurrency.map((c) => (
          <div key={c.currency} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.currency}</p>
            <p className="text-2xl font-bold font-mono mt-1 tabular-nums">
              {parseFloat(c.totalBalance).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Posición consolidada</p>
          </div>
        ))}
      </div>

      {/* Accounts table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b px-6 py-3">
          <h2 className="font-semibold text-sm">Saldos por cuenta</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Cuenta</th>
              <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
              <th className="px-4 py-2.5 text-left font-medium">Empresa</th>
              <th className="px-4 py-2.5 text-left font-medium">Moneda</th>
              <th className="px-4 py-2.5 text-left font-medium">Estado</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {report.accounts.map((acc) => (
              <tr key={acc.accountId} className="border-t">
                <td className="px-4 py-2.5 font-medium">{acc.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{TYPE_LABELS[acc.type] ?? acc.type}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{acc.companyName ?? "—"}</td>
                <td className="px-4 py-2.5">{acc.currency}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{STATUS_LABELS[acc.status] ?? acc.status}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-mono">
                  {fmt(acc.balance, acc.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* By company breakdown */}
      {report.byCompany.length > 1 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="border-b px-6 py-3">
            <h2 className="font-semibold text-sm">Por empresa</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Empresa</th>
                <th className="px-4 py-2.5 text-left font-medium">Moneda</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.byCompany.map((co) =>
                co.byCurrency.map((c, i) => (
                  <tr key={`${co.companyId ?? "none"}-${c.currency}`} className="border-t">
                    {i === 0 && (
                      <td className="px-4 py-2.5 font-medium" rowSpan={co.byCurrency.length}>
                        {co.companyName ?? "Sin empresa"}
                      </td>
                    )}
                    <td className="px-4 py-2.5">{c.currency}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">
                      {fmt(c.totalBalance, c.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
