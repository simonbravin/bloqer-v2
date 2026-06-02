import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduleWorkspaceDto } from "@bloqer/services";

export function ScheduleSummaryCards({ workspace }: { workspace: ScheduleWorkspaceDto }) {
  const { summary } = workspace;
  const filteredView = summary.totalItems !== summary.unfilteredActiveCount;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Avance cronograma</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {summary.scheduleProgressPct != null ? `${summary.scheduleProgressPct}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Ponderado por duración (BR-SCH-002: distinto de certificado)</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Ítems activos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {filteredView ? summary.totalItems : summary.unfilteredActiveCount}
          </p>
          {filteredView && (
            <p className="text-xs text-muted-foreground">
              de {summary.unfilteredActiveCount} en total (filtros activos)
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Completados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{summary.completedItems}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Atrasados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums text-destructive">{summary.delayedItems}</p>
        </CardContent>
      </Card>
    </div>
  );
}
