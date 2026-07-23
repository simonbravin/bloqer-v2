import Link from "next/link";
import type { CompanyFinanceOperationsSummary, FinanceHubOverview } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { FinanceProjectionPanel } from "@/features/finance/components/finance-projection-panel";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { Inbox } from "lucide-react";

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function CompanyOperationsSection({ summary }: { summary: CompanyFinanceOperationsSummary }) {
  if (!summary.visible) return null;
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-base">Gastos generales (empresa)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {summary.loadFailed ? (
          <p className="text-sm text-destructive">No se pudo cargar el detalle.</p>
        ) : summary.recentCorporatePayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pagos corporativos recientes.</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.recentCorporatePayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/finanzas/pagos-proveedor/${p.id}`}
                        className="text-primary hover:underline"
                      >
                        {p.supplierLabel}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(p.paymentDate)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoneyAmount(p.amount, p.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </CardContent>
    </Card>
  );
}

export function FinanceHubView({ overview }: { overview: FinanceHubOverview }) {
  if (!overview.hasFinanceModules) {
    return (
      <EmptyState title="Finanzas no habilitadas" body="Activá los módulos financieros para este tenant." />
    );
  }

  if (!overview.canSeeAnything) {
    return (
      <EmptyState title="Sin acceso" body="Pedí permiso de visualización en Finanzas o Tesorería." />
    );
  }

  return (
    <div className="space-y-8">
      {overview.alerts.length > 0 ? (
        <div className="space-y-2">
          {overview.alerts.map((a, i) => (
            <div
              key={i}
              role="note"
              className={
                a.variant === "warning"
                  ? "rounded-xl border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm"
                  : "rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              }
            >
              {a.message}
            </div>
          ))}
        </div>
      ) : null}

      {overview.hubKpis.length > 0 ? (
        <KpiStatGrid title="Indicadores" columns={4}>
          {overview.hubKpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </KpiStatGrid>
      ) : null}

      {overview.projection ? <FinanceProjectionPanel projection={overview.projection} /> : null}

      {overview.companyOperations ? (
        <CompanyOperationsSection summary={overview.companyOperations} />
      ) : null}
    </div>
  );
}
