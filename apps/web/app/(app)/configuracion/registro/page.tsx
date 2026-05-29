import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AUDIT_UI_MODULES,
  AUDIT_UI_MODULE_LABEL_ES,
  type AuditUiModule,
} from "@bloqer/domain";
import {
  getTenantAuditLogEntry,
  listAuditActorOptions,
  listAuditProjectOptions,
  listTenantAuditLog,
  parseAuditDateFrom,
  parseAuditDateToInclusive,
  ServiceError,
  type ListTenantAuditLogResult,
  type TenantAuditLogDetail,
} from "@bloqer/services";
import { listTenantAuditLogUrlFiltersSchema, exportTenantAuditLogUrlFiltersSchema } from "@bloqer/validators";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditLogDetailSheet } from "@/features/audit-log/audit-log-detail-sheet";
import { buildAuditEntityHref } from "@/features/audit-log/audit-entity-href";
import { ReportExportActions } from "@/features/reports";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { canViewTenantAuditLog } from "@/lib/configuracion-subnav";

interface PageProps {
  searchParams: Promise<{
    module?: string;
    projectId?: string;
    actorUserId?: string;
    action?: string;
    reference?: string;
    dateFrom?: string;
    dateTo?: string;
    cursor?: string;
    entry?: string;
  }>;
}

function buildRegistroSearch(params: Record<string, string | undefined>, omit: string[] = []): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value?.trim() && !omit.includes(key)) sp.set(key, value.trim());
  }
  const q = sp.toString();
  return q ? `/configuracion/registro?${q}` : "/configuracion/registro";
}

export default async function ConfiguracionRegistroPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canViewTenantAuditLog(current.tenantCtx.roles)) redirect("/dashboard");

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const entryId = sp.entry?.trim() || undefined;

  const trimmedFilters = {
    module: sp.module?.trim() || undefined,
    projectId: sp.projectId?.trim() || undefined,
    actorUserId: sp.actorUserId?.trim() || undefined,
    action: sp.action?.trim() || undefined,
    reference: sp.reference?.trim() || undefined,
    dateFrom: sp.dateFrom?.trim() || undefined,
    dateTo: sp.dateTo?.trim() || undefined,
  };

  const exportFilters = exportTenantAuditLogUrlFiltersSchema.safeParse(trimmedFilters);

  const urlFilters = listTenantAuditLogUrlFiltersSchema.safeParse({
    ...trimmedFilters,
    cursor: sp.cursor?.trim() || undefined,
  });

  const filterParams = {
    module: sp.module,
    projectId: sp.projectId,
    actorUserId: sp.actorUserId,
    action: sp.action,
    reference: sp.reference,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    cursor: sp.cursor,
  };

  let validationError: string | null = null;
  if (!urlFilters.success) {
    validationError =
      urlFilters.error.issues.map((i) => i.message).join("; ") || "Parámetros de búsqueda inválidos";
  }

  const parsed = urlFilters.success ? urlFilters.data : null;
  const auditModule = parsed?.module;
  const projectId = parsed?.projectId;
  const actorUserId = parsed?.actorUserId;
  const action = parsed?.action;
  const reference = parsed?.reference;
  const cursor = parsed?.cursor;

  let result: ListTenantAuditLogResult = { rows: [], nextCursor: null };
  let actors: Awaited<ReturnType<typeof listAuditActorOptions>> = [];
  let projects: Awaited<ReturnType<typeof listAuditProjectOptions>> = [];
  let detail: TenantAuditLogDetail | null = null;

  try {
    [actors, projects] = await Promise.all([
      listAuditActorOptions(ctx),
      listAuditProjectOptions(ctx),
    ]);

    if (entryId) {
      try {
        detail = await getTenantAuditLogEntry(entryId, ctx);
      } catch (e) {
        if (!(e instanceof ServiceError && e.code === "NOT_FOUND")) throw e;
      }
    }

    if (parsed) {
      result = await listTenantAuditLog(
        {
          module: auditModule,
          projectId,
          actorUserId,
          action,
          reference,
          dateFrom: parsed.dateFrom ? parseAuditDateFrom(parsed.dateFrom) : undefined,
          dateTo: parsed.dateTo ? parseAuditDateToInclusive(parsed.dateTo) : undefined,
          cursor,
          limit: 50,
        },
        ctx,
      );
    }
  } catch (e) {
    if (e instanceof ServiceError) {
      if (e.code === "FORBIDDEN") redirect("/dashboard");
      if (e.code === "VALIDATION" || e.code === "NOT_FOUND") {
        validationError = e.message;
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  const closeHref = buildRegistroSearch(filterParams, ["entry"]);
  const nextPageHref = result.nextCursor
    ? buildRegistroSearch({ ...filterParams, cursor: result.nextCursor, entry: undefined })
    : null;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registro de actividad</h1>
          <p className="text-sm text-muted-foreground">
            Trazabilidad de acciones críticas: quién hizo qué, sobre qué entidad y cuándo. Solo visible para
            administradores. CSV hasta 10.000 filas (con diff JSON); PDF hasta 350 filas (resumen).
          </p>
        </div>
        {exportFilters.success && !validationError ? (
          <ReportExportActions
            exportPath="/api/configuracion/registro.csv"
            params={exportFilters.data}
            pdf
          />
        ) : null}
      </div>

      {validationError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {validationError}
        </div>
      ) : null}

      <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="grid gap-1">
          <label htmlFor="module" className="text-xs text-muted-foreground">
            Módulo
          </label>
          <select
            id="module"
            name="module"
            defaultValue={auditModule ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {AUDIT_UI_MODULES.map((m) => (
              <option key={m} value={m}>
                {AUDIT_UI_MODULE_LABEL_ES[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="projectId" className="text-xs text-muted-foreground">
            Proyecto
          </label>
          <select
            id="projectId"
            name="projectId"
            defaultValue={projectId ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="actorUserId" className="text-xs text-muted-foreground">
            Usuario
          </label>
          <select
            id="actorUserId"
            name="actorUserId"
            defaultValue={actorUserId ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {actors.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name ?? a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="reference" className="text-xs text-muted-foreground">
            Nº documento
          </label>
          <Input id="reference" name="reference" placeholder="#142" defaultValue={reference ?? ""} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="dateFrom" className="text-xs text-muted-foreground">
            Desde
          </label>
          <Input id="dateFrom" name="dateFrom" type="date" defaultValue={parsed?.dateFrom ?? ""} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="dateTo" className="text-xs text-muted-foreground">
            Hasta
          </label>
          <Input id="dateTo" name="dateTo" type="date" defaultValue={parsed?.dateTo ?? ""} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="action" className="text-xs text-muted-foreground">
            Acción (código)
          </label>
          <Input id="action" name="action" placeholder="purchase_order.issued" defaultValue={action ?? ""} />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" size="sm" className="w-full sm:w-auto">
            Filtrar
          </Button>
          <Button type="button" variant="outline" size="sm" asChild className="w-full sm:w-auto">
            <Link href="/configuracion/registro">Limpiar</Link>
          </Button>
        </div>
      </form>

      <div className="rounded-xl border bg-card shadow-sm">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Proyecto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {validationError ? "Corregí los filtros para ver resultados." : "Sin registros para los filtros seleccionados."}
                  </TableCell>
                </TableRow>
              ) : (
                result.rows.map((row) => {
                  const rowHref = buildRegistroSearch({ ...filterParams, entry: row.id });
                  const entityHref = buildAuditEntityHref(row.entityType, row.entityId, {
                    projectId: row.projectId,
                  });
                  return (
                    <TableRow key={row.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap">
                        <Link href={rowHref} className="block text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={rowHref} className="block">
                          <div className="text-sm">{row.actorLabel}</div>
                          {row.actorName && row.actorEmail ? (
                            <div className="text-xs text-muted-foreground">{row.actorEmail}</div>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={rowHref} className="block">
                          {row.module ? AUDIT_UI_MODULE_LABEL_ES[row.module as AuditUiModule] : "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={rowHref} className="block text-sm">
                          {row.actionLabel}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entityHref ? (
                          <Link href={entityHref} className="font-medium hover:underline">
                            {row.reference ?? row.entityType}
                          </Link>
                        ) : (
                          <Link href={rowHref} className="block">
                            {row.reference ?? row.entityType}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.projectName ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableScroll>
      </div>

      {nextPageHref ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" asChild>
            <Link href={nextPageHref}>Cargar más</Link>
          </Button>
        </div>
      ) : null}

      <AuditLogDetailSheet detail={detail} open={Boolean(entryId)} closeHref={closeHref} />
    </PageShell>
  );
}
