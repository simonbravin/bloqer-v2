import Link from "next/link";
import type { ProjectFinanceOverview, ProjectFinanceOverviewWarning } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  if (w.reason === "TENANT_MODULE_DISABLED") return `El módulo ${mod} está deshabilitado (${w.section}).`;
  if (w.reason === "MISSING_PERMISSION") return `Sin permiso para ver ${mod} (${w.section}).`;
  return `No se pudieron cargar datos de ${mod} (${w.section}).`;
}

export function ProjectFinanceOverviewView({ overview }: { overview: ProjectFinanceOverview }) {
  const { project, sections, warnings } = overview;

  return (
    <div className="space-y-6">
      <ProjectPageHeader
        title="Tablero de finanzas"
        subtitle={project.code ? <span className="font-mono text-sm">{project.code}</span> : undefined}
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
              <CardTitle className="text-base">
                {sections.ar.canView ? (
                  <Link href={sections.ar.links.receivables} className="hover:underline">
                    Cuentas por cobrar
                  </Link>
                ) : (
                  "Cuentas por cobrar"
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sections.ar.canView ? (
                <p className="text-sm text-muted-foreground">Sin permiso.</p>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Saldo total
                    </p>
                    <MoneyList rows={sections.ar.totalReceivableByCurrency} emptyLabel="Sin saldo abierto." />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Vencido
                    </p>
                    <MoneyList rows={sections.ar.overdueByCurrency} emptyLabel="Sin saldo vencido." />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {sections.ap ? (
          <Card className={sections.ap.canView ? "" : "border-dashed"}>
            <CardHeader>
              <CardTitle className="text-base">
                {sections.ap.canView ? (
                  <Link href={sections.ap.links.payables} className="hover:underline">
                    Cuentas por pagar
                  </Link>
                ) : (
                  "Cuentas por pagar"
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sections.ap.canView ? (
                <p className="text-sm text-muted-foreground">Sin permiso.</p>
              ) : (
                <>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Saldo total
                    </p>
                    <MoneyList rows={sections.ap.totalPayableByCurrency} emptyLabel="Sin saldo abierto." />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Vencido
                    </p>
                    <MoneyList rows={sections.ap.overdueByCurrency} emptyLabel="Sin saldo vencido." />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {sections.treasury ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <Link href={sections.treasury.cashFlowLink} className="hover:underline">
                  Flujo de caja
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sections.treasury.notes.length > 0 ? (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {sections.treasury.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Cobros y pagos de la obra.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {sections.budget ? (
          <Card
            className={
              !sections.budget.canViewBudgets && !sections.budget.canViewCostControl ? "border-dashed" : ""
            }
          >
            <CardHeader>
              <CardTitle className="text-base">
                {sections.budget.canViewBudgets ? (
                  <Link href={sections.budget.budgetLink} className="hover:underline">
                    Presupuesto y costos
                  </Link>
                ) : sections.budget.canViewCostControl ? (
                  <Link href={sections.budget.costControlLink} className="hover:underline">
                    Presupuesto y costos
                  </Link>
                ) : (
                  "Presupuesto y costos"
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {sections.budget.latestApprovedBudgetName != null ? (
                <p>
                  <span className="text-muted-foreground">Aprobado: </span>
                  <span className="font-medium">{sections.budget.latestApprovedBudgetName}</span>
                  {sections.budget.latestApprovedBudgetVersion != null ? (
                    <span className="text-muted-foreground"> (v{sections.budget.latestApprovedBudgetVersion})</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-muted-foreground">Sin presupuesto aprobado.</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
