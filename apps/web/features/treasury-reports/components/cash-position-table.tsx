import type { CashPositionReport } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatCurrencyDisplay } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";

const TYPE_LABELS: Record<string, string> = {
  BANK: "Banco",
  CASH: "Caja",
  DIGITAL_WALLET: "Billetera",
  OTHER: "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activa",
  INACTIVE: "Inactiva",
  CLOSED: "Cerrada",
};

interface Props {
  report: CashPositionReport;
}

export function CashPositionTable({ report }: Props) {
  if (report.accounts.length === 0) {
    return <ListEmptyState message="No hay cuentas con datos." />;
  }

  return (
    <div className="space-y-6">
      <KpiStatGrid title={null} columns={4}>
        {report.byCurrency.map((c) => (
          <KpiStatCard
            key={c.currency}
            label={`Posición ${c.currency}`}
            value={formatMoneyAmount(c.totalBalance)}
            subtitle={formatCurrencyDisplay(c.currency)}
          />
        ))}
      </KpiStatGrid>

      <DataTableSection title="Saldos por cuenta">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.accounts.map((acc) => (
                <TableRow key={acc.accountId}>
                  <TableCell className="font-medium">{acc.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {TYPE_LABELS[acc.type] ?? acc.type}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{acc.companyName ?? "—"}</TableCell>
                  <TableCell>{formatCurrencyDisplay(acc.currency)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {STATUS_LABELS[acc.status] ?? acc.status}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono">
                    {formatMoneyAmount(acc.balance)} {acc.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </DataTableSection>

      {report.byCompany.length > 1 && (
        <DataTableSection title="Por empresa">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byCompany.map((co) =>
                  co.byCurrency.map((c, i) => (
                    <TableRow key={`${co.companyId ?? "none"}-${c.currency}`}>
                      {i === 0 && (
                        <TableCell rowSpan={co.byCurrency.length} className="font-medium">
                          {co.companyName ?? "Sin empresa"}
                        </TableCell>
                      )}
                      <TableCell>{formatCurrencyDisplay(c.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono">
                        {formatMoneyAmount(c.totalBalance)} {c.currency}
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}
    </div>
  );
}
