import Link from "next/link";
import type { ProjectFinanceOverview, ProjectFinanceOverviewWarning } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { formatMoneyAmount } from "@/lib/format-money";

function MoneyList({ rows, emptyLabel }: { rows: { currency: string; amount: string }[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.currency} className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted-foreground">{r.currency}</span>
          <span className="font-medium text-foreground">{formatMoneyAmount(r.amount, r.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function warningText(w: ProjectFinanceOverviewWarning): string {
  const mod = w.module;
  if (w.reason === "TENANT_MODULE_DISABLED") return `El módulo ${mod} está deshabilitado para este tenant (${w.section}).`;
  if (w.reason === "MISSING_PERMISSION") return `Sin permiso para ver datos de ${mod} (${w.section}).`;
  return `No se pudieron cargar datos de ${mod} (${w.section}).`;
}

export function ProjectFinanceOverviewView({ overview }: { overview: ProjectFinanceOverview }) {
  const { project, sections, quickActions, warnings } = overview;

  return (
    <div className="space-y-6">
      <ProjectPageHeader
        projectId={project.id}
        projectName={project.name}
        title="Tablero de finanzas"
        subtitle={
          project.code ? (
            <span className="font-mono text-sm">{project.code}</span>
          ) : (
            "Cobros, pagos y saldos de la obra"
          )
        }
      />

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">Avisos</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {warnings.map((w, i) => (
              <li key={`${w.module}-${w.section}-${i}`}>{warningText(w)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {sections.ar ? (
          <Card className={sections.ar.canView ? "" : "border-dashed"}>
            <CardHeader>
              <CardTitle className="text-base">Cuentas por cobrar</CardTitle>
              <CardDescription>Saldo abierto por moneda (sin convertir entre monedas).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sections.ar.canView ? (
                <p className="text-sm text-muted-foreground">No tenés permiso para ver cuentas por cobrar de este proyecto.</p>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Saldo total</p>
                    <MoneyList rows={sections.ar.totalReceivableByCurrency} emptyLabel="Sin saldo abierto." />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vencido</p>
                    <MoneyList rows={sections.ar.overdueByCurrency} emptyLabel="Sin saldo vencido." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Facturas de venta emitidas (abiertas):{" "}
                    <span className="font-medium text-foreground">{sections.ar.openInvoicesCount}</span>
                  </p>
                </>
              )}
            </CardContent>
            {sections.ar.canView ? (
              <CardFooter className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.ar.links.invoices}>Facturas</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.ar.links.receivables}>Cuentas por cobrar</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.ar.links.collections}>Cobranzas</Link>
                </Button>
              </CardFooter>
            ) : null}
          </Card>
        ) : null}

        {sections.ap ? (
          <Card className={sections.ap.canView ? "" : "border-dashed"}>
            <CardHeader>
              <CardTitle className="text-base">Cuentas por pagar</CardTitle>
              <CardDescription>Saldo abierto por moneda (sin convertir entre monedas).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sections.ap.canView ? (
                <p className="text-sm text-muted-foreground">No tenés permiso para ver cuentas por pagar de este proyecto.</p>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Saldo total</p>
                    <MoneyList rows={sections.ap.totalPayableByCurrency} emptyLabel="Sin saldo abierto." />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vencido</p>
                    <MoneyList rows={sections.ap.overdueByCurrency} emptyLabel="Sin saldo vencido." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Facturas proveedor emitidas:{" "}
                    <span className="font-medium text-foreground">{sections.ap.openSupplierInvoicesCount}</span>
                  </p>
                </>
              )}
            </CardContent>
            {sections.ap.canView ? (
              <CardFooter className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.ap.links.supplierInvoices}>Facturas proveedor</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.ap.links.payables}>Cuentas por pagar</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.ap.links.payments}>Pagos</Link>
                </Button>
              </CardFooter>
            ) : null}
          </Card>
        ) : null}

        {sections.treasury ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Flujo de caja</CardTitle>
              <CardDescription>Cobros y pagos imputados a la obra (reporte existente).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sections.treasury.notes.map((note, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  {note}
                </p>
              ))}
            </CardContent>
            <CardFooter>
              <Button asChild size="sm">
                <Link href={sections.treasury.cashFlowLink}>Abrir flujo de caja</Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {sections.budget ? (
          <Card className={!sections.budget.canViewBudgets && !sections.budget.canViewCostControl ? "border-dashed" : ""}>
            <CardHeader>
              <CardTitle className="text-base">Presupuesto y costos</CardTitle>
              <CardDescription>Enlaces al presupuesto y al control de costos del proyecto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {sections.budget.latestApprovedBudgetName != null ? (
                <p>
                  <span className="text-muted-foreground">Último presupuesto aprobado/cerrado: </span>
                  <span className="font-medium">{sections.budget.latestApprovedBudgetName}</span>
                  {sections.budget.latestApprovedBudgetVersion != null ? (
                    <span className="text-muted-foreground"> (v{sections.budget.latestApprovedBudgetVersion})</span>
                  ) : null}
                </p>
              ) : null}
              {sections.budget.notes.map((n, i) => (
                <p key={i} className="text-muted-foreground">
                  {n}
                </p>
              ))}
              {!sections.budget.canViewBudgets ? (
                <p className="text-muted-foreground">Sin acceso a la lista de presupuestos.</p>
              ) : null}
              {!sections.budget.canViewCostControl ? (
                <p className="text-muted-foreground">Sin acceso al control de costos.</p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              {sections.budget.canViewBudgets ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.budget.budgetLink}>Presupuestos</Link>
                </Button>
              ) : null}
              {sections.budget.canViewCostControl ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={sections.budget.costControlLink}>Control de costos</Link>
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        ) : null}
      </div>

      {quickActions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accesos rápidos</CardTitle>
            <CardDescription>Atajos a rutas ya implementadas en el proyecto.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {quickActions.map((a) => (
                <li key={a.href + a.label}>
                  <Link
                    href={a.href}
                    className="group block rounded-md border bg-card px-3 py-2 transition-colors hover:bg-muted/60"
                  >
                    <span className="font-medium text-foreground group-hover:underline">{a.label}</span>
                    {a.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        Los gastos generales fuera de obra y un módulo de gastos dedicado siguen sin definirse en producto. No se
        muestran totales mezclando monedas distintas.
      </p>
    </div>
  );
}
