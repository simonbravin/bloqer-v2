import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canManageScheduledReports,
  getScheduledReportCatalog,
  listScheduledReports,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import {
  SCHEDULED_REPORT_FREQUENCY_LABEL,
  SCHEDULED_REPORT_RUN_STATUS_HINT,
  SCHEDULED_REPORT_RUN_STATUS_LABEL,
  SCHEDULED_REPORT_STATUS_LABEL,
  runStatusBadgeVariant,
} from "@/features/scheduled-reports/scheduled-report-labels";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { ScheduledReportCatalogPanel } from "@/features/scheduled-reports/scheduled-report-catalog-panel";

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

  const [rows, tenantCatalog, projectCatalog] = await Promise.all([
    listScheduledReports(ctx),
    getScheduledReportCatalog(ctx, "TENANT"),
    getScheduledReportCatalog(ctx, "PROJECT"),
  ]);

  const okMessages: Record<string, string> = {
    deleted: "Envío programado eliminado.",
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Reportes programados"
        actions={
          <Button asChild>
            <Link href="/configuracion/reportes/nuevo">Nuevo envío</Link>
          </Button>
        }
      />

      {sp.ok && okMessages[sp.ok] ? (
        <p className="text-sm text-green-600 dark:text-green-500">{okMessages[sp.ok]}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ScheduledReportCatalogPanel
          title="Empresa general"
          hint="Alcance tenant. PDF y CSV (Excel) en todos."
          catalog={tenantCatalog}
        />
        <ScheduledReportCatalogPanel
          title="Proyecto"
          hint="Alcance obra. PDF y CSV (Excel) en todos."
          catalog={projectCatalog}
        />
      </div>

      {rows.length === 0 ? (
        <ListEmptyState
          title="Todavía no hay envíos programados"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/configuracion/reportes/nuevo">Crear primer envío</Link>
            </Button>
          }
        />
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
                            title={SCHEDULED_REPORT_RUN_STATUS_HINT[r.lastRunStatus]}
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
