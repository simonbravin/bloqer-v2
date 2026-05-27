import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { type DashboardProjectSummary, formatDashboardMoney } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

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
  return formatDate(iso + "T12:00:00");
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
          Proyectos recientes y presupuesto de venta agregado (activos). Avance promedio: {progressLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Plazos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={p.href} className="text-primary hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.clientName ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtShort(p.startDate) ? `Inicio ${fmtShort(p.startDate)}` : "—"}
                    {p.startDate && p.expectedEndDate ? " · " : null}
                    {fmtShort(p.expectedEndDate) ? `Fin ${fmtShort(p.expectedEndDate)}` : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{projectStatusLabel(p.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {p.budgetAmount != null && p.budgetCurrency
                      ? formatDashboardMoney(p.budgetAmount, p.budgetCurrency)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm">
          <Link href="/proyectos">Ver todos los proyectos</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
