import Link from "next/link";
import { type DashboardProjectSummary, formatDashboardMoney } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

function projectStatusLabel(status: string): string {
  if (status === "ACTIVE") return "Activo";
  if (status === "DRAFT") return "Borrador";
  if (status === "ON_HOLD") return "En pausa";
  if (status === "COMPLETED") return "Finalizado";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

function fmtShort(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso + "T12:00:00").toLocaleDateString("es-AR");
}

export function ProjectProgressCard({
  summary,
  showCostControlHint,
}: {
  summary: DashboardProjectSummary;
  showCostControlHint?: boolean;
}) {
  const progressLabel =
    summary.averageProgressPct == null
      ? "Sin avance cargado"
      : `${Math.round(summary.averageProgressPct)} %`;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Proyectos</CardTitle>
        <CardDescription>
          {summary.activeProjectsCount} activo{summary.activeProjectsCount === 1 ? "" : "s"} ·{" "}
          {summary.draftProjectsCount} borrador · {summary.onHoldProjectsCount} en pausa · Avance promedio:{" "}
          {progressLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Presupuesto de venta (último aprobado/cerrado, activos)</p>
          {summary.budgetSaleByCurrency.length === 0 ? (
            <p className="mt-1 text-lg font-semibold text-muted-foreground">—</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {summary.budgetSaleByCurrency.map((row) => (
                <li key={row.currency} className="flex justify-between text-sm tabular-nums">
                  <span className="text-muted-foreground">{row.currency}</span>
                  <span className="font-semibold">{formatDashboardMoney(row.amount, row.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Los importes no se suman entre monedas distintas.</p>
        </div>

        {showCostControlHint ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
            <p className="font-medium">Control de costos</p>
            <p className="mt-1 text-muted-foreground">
              Disponible por proyecto cuando exista presupuesto aprobado o cerrado.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/proyectos">Ir a proyectos</Link>
            </Button>
          </div>
        ) : null}

        <ul className="divide-y rounded-lg border">
          {summary.projects.map((p) => (
            <li key={p.id}>
              <Link
                href={p.href}
                className="flex flex-col gap-1 px-4 py-3 text-sm transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="font-medium">{p.name}</span>
                  {p.clientName ? (
                    <p className="truncate text-xs text-muted-foreground">{p.clientName}</p>
                  ) : null}
                  {(p.startDate || p.expectedEndDate) && (
                    <p className="text-xs text-muted-foreground">
                      {fmtShort(p.startDate) ? `Inicio ${fmtShort(p.startDate)}` : null}
                      {p.startDate && p.expectedEndDate ? " · " : null}
                      {fmtShort(p.expectedEndDate) ? `Fin est. ${fmtShort(p.expectedEndDate)}` : null}
                    </p>
                  )}
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant="secondary">{projectStatusLabel(p.status)}</Badge>
                  {p.budgetAmount != null && p.budgetCurrency ? (
                    <span className="tabular-nums">{formatDashboardMoney(p.budgetAmount, p.budgetCurrency)}</span>
                  ) : (
                    <span className="text-xs">Sin presupuesto aprobado</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm">
          <Link href="/proyectos">Ver todos los proyectos</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
