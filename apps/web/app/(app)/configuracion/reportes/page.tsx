import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canManageScheduledReports,
  listScheduledReports,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import {
  SCHEDULED_REPORT_FREQUENCY_LABEL,
  SCHEDULED_REPORT_RUN_STATUS_LABEL,
  SCHEDULED_REPORT_STATUS_LABEL,
  runStatusBadgeVariant,
} from "@/features/scheduled-reports/scheduled-report-labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

type Props = {
  searchParams: Promise<{ ok?: string }>;
};

export default async function ConfiguracionReportesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  if (!canManageScheduledReports(ctx)) notFound();

  const rows = await listScheduledReports(ctx);

  const okMessages: Record<string, string> = {
    deleted: "Envío programado eliminado.",
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Reportes programados"
        subtitle="Envíos automáticos por email según la programación configurada. El cron horario genera adjuntos y registra cada intento."
        actions={
          <Button asChild>
            <Link href="/configuracion/reportes/nuevo">Nuevo envío</Link>
          </Button>
        }
      />

      {sp.ok && okMessages[sp.ok] ? (
        <p className="text-sm text-green-600 dark:text-green-500">{okMessages[sp.ok]}</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay envíos programados.</p>
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead>Frecuencia</TableHead>
                <TableHead>Próxima ejecución</TableHead>
                <TableHead>Última corrida</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Contenido</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    {r.scope === "TENANT" ? "Empresa" : (r.projectLabel ?? "Proyecto")}
                  </TableCell>
                  <TableCell>
                    {SCHEDULED_REPORT_FREQUENCY_LABEL[r.frequency] ?? r.frequency} · {r.timeOfDay}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(r.nextRunAt)}</TableCell>
                  <TableCell className="text-sm">
                    {r.lastRunAt ? (
                      <span className="block">
                        {formatDateTime(r.lastRunAt)}
                        {r.lastRunStatus ? (
                          <Badge
                            variant={runStatusBadgeVariant(r.lastRunStatus)}
                            className="mt-1"
                          >
                            {SCHEDULED_REPORT_RUN_STATUS_LABEL[r.lastRunStatus]}
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>
                      {SCHEDULED_REPORT_STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.itemCount} rep. · {r.recipientCount} dest.
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/configuracion/reportes/${r.id}`}>Ver</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
    </PageShell>
  );
}
