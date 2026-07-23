import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { TableScroll } from "@/components/ui/table-scroll";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canRunOperationalAlerts, listEmailDeliveryLogs } from "@bloqer/services";
import type { EmailDeliveryStatus, EmailDeliveryType } from "@bloqer/database";
import { formatDateTime } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  EMAIL_DELIVERY_STATUS_HINT,
  EMAIL_DELIVERY_STATUS_LABEL,
  deliveryStatusBadgeVariant,
} from "@/features/scheduled-reports/scheduled-report-labels";

const STATUSES: EmailDeliveryStatus[] = ["PENDING", "SENT", "SKIPPED", "FAILED"];
const EMAIL_TYPE_LABEL: Record<EmailDeliveryType, string> = {
  NOTIFICATION: "Notificación",
  OPERATIONAL_ALERT: "Alerta operativa",
  REPORT_MANUAL: "Reporte manual",
  REPORT_SCHEDULED: "Reporte programado",
};
const EMAIL_TYPES: EmailDeliveryType[] = [
  "NOTIFICATION",
  "OPERATIONAL_ALERT",
  "REPORT_MANUAL",
  "REPORT_SCHEDULED",
];

function parseEnumParam<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function fmtWhen(iso: Date) {
  return formatDateTime(iso, String(iso));
}

interface PageProps {
  searchParams: Promise<{
    status?: string;
    emailType?: string;
    recipientEmail?: string;
    dateFrom?: string;
    dateTo?: string;
    scheduledReportId?: string;
  }>;
}

export default async function EmailDeliveryLogsPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (!canRunOperationalAlerts(ctx)) {
    redirect("/notificaciones");
  }

  const sp = await searchParams;
  const status = parseEnumParam(sp.status, STATUSES);
  const emailType = parseEnumParam(sp.emailType, EMAIL_TYPES);

  const scheduledReportId = sp.scheduledReportId?.trim() || undefined;

  const items = await listEmailDeliveryLogs(
    {
      status,
      emailType: scheduledReportId ? "REPORT_SCHEDULED" : emailType,
      recipientEmail: sp.recipientEmail,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      relatedEntityType: scheduledReportId ? "SCHEDULED_REPORT" : undefined,
      relatedEntityId: scheduledReportId,
      limit: 80,
    },
    ctx,
  );

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/notificaciones" className="text-primary underline-offset-4 hover:underline">
            ← Volver a notificaciones
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Historial de emails enviados</h1>
        {scheduledReportId ? (
          <p className="mt-2 text-sm">
            Filtro: envío programado{" "}
            <Link
              href={`/configuracion/reportes/${scheduledReportId}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              ver configuración
            </Link>
            {" · "}
            <Link
              href="/notificaciones/emails"
              className="text-primary underline-offset-4 hover:underline"
            >
              quitar filtro
            </Link>
          </p>
        ) : null}
      </div>

      <form
        className="rounded-lg border bg-card p-4 space-y-3"
        method="get"
        action="/notificaciones/emails"
      >
        {scheduledReportId ? (
          <input type="hidden" name="scheduledReportId" value={scheduledReportId} />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="f-status">Estado</Label>
            <select
              id="f-status"
              name="status"
              defaultValue={sp.status ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EMAIL_DELIVERY_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-type">Tipo</Label>
            <select
              id="f-type"
              name="emailType"
              defaultValue={scheduledReportId ? "REPORT_SCHEDULED" : (sp.emailType ?? "")}
              disabled={Boolean(scheduledReportId)}
              aria-describedby={scheduledReportId ? "f-type-help" : undefined}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Todos</option>
              {EMAIL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMAIL_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {scheduledReportId ? (
              <p id="f-type-help" className="text-xs text-muted-foreground">
                Solo emails de este envío programado.
              </p>
            ) : null}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-to">Destinatario (contiene)</Label>
            <Input
              id="f-to"
              name="recipientEmail"
              defaultValue={sp.recipientEmail ?? ""}
              placeholder="email@…"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-df">Desde</Label>
            <Input id="f-df" name="dateFrom" type="date" defaultValue={sp.dateFrom ?? ""} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="f-dt">Hasta</Label>
            <Input id="f-dt" name="dateTo" type="date" defaultValue={sp.dateTo ?? ""} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Filtrar
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/notificaciones/emails">Limpiar</Link>
          </Button>
        </div>
      </form>

      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Destinatario</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Asunto</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No hay registros para los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtWhen(row.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-sm">
                    {row.recipientEmail}
                  </TableCell>
                  <TableCell className="text-xs">{EMAIL_TYPE_LABEL[row.emailType]}</TableCell>
                  <TableCell className="text-xs">
                    <Badge
                      variant={deliveryStatusBadgeVariant(row.status)}
                      title={EMAIL_DELIVERY_STATUS_HINT[row.status]}
                    >
                      {EMAIL_DELIVERY_STATUS_LABEL[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.provider}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm" title={row.subject}>
                    {row.subject}
                  </TableCell>
                  <TableCell
                    className="max-w-[220px] truncate text-xs text-muted-foreground"
                    title={
                      row.skippedReason ??
                      row.errorMessage ??
                      row.providerMessageId ??
                      EMAIL_DELIVERY_STATUS_HINT[row.status]
                    }
                  >
                    {row.skippedReason ??
                      row.errorMessage ??
                      row.providerMessageId ??
                      EMAIL_DELIVERY_STATUS_HINT[row.status]}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableScroll>
    </PageShell>
  );
}
