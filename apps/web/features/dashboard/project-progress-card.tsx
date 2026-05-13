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
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Proyectos</CardTitle>
        <CardDescription>
          {summary.activeProjectsCount} activo{summary.activeProjectsCount === 1 ? "" : "s"} · Avance promedio:{" "}
          {progressLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Total presupuestado (venta)</p>
          <p className="text-xl font-semibold tabular-nums">{summary.totalProjectsAmount}</p>
          {summary.totalProjectsAmountNote ? (
            <p className="mt-1 text-xs text-muted-foreground">{summary.totalProjectsAmountNote}</p>
          ) : null}
        </div>

        {showCostControlHint ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Control de costos</p>
            <p className="mt-1 text-muted-foreground">
              Disponible por proyecto cuando exista presupuesto seleccionado.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/proyectos">Ir a proyectos</Link>
            </Button>
          </div>
        ) : null}

        <ul className="divide-y rounded-md border">
          {summary.projects.map((p) => (
            <li key={p.id}>
              <Link
                href={p.href}
                className="flex flex-col gap-1 px-4 py-3 text-sm transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium">{p.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant="secondary">{projectStatusLabel(p.status)}</Badge>
                  {p.budgetAmount != null ? (
                    <span className="tabular-nums">{formatDashboardMoney(p.budgetAmount, "ARS")}</span>
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
