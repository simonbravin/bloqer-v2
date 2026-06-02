import Link from "next/link";
import type { ProjectOverviewActivity } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function Cell({
  label,
  value,
  href,
  hint,
  hintHref,
}: {
  label: string;
  value: number | null;
  href?: string;
  hint?: string;
  hintHref?: string;
}) {
  const display = value === null ? "—" : String(value);
  const body =
    href && value !== null ? (
      <Link href={href} className="font-semibold tabular-nums text-foreground underline-offset-2 hover:underline">
        {display}
      </Link>
    ) : (
      <span className="font-semibold tabular-nums">{display}</span>
    );
  return (
    <div className="rounded-lg border bg-background/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg">{body}</p>
      {hint && hintHref ? (
        <Link href={hintHref} className="mt-1 block text-xs text-amber-700 dark:text-amber-500 hover:underline">
          {hint}
        </Link>
      ) : null}
    </div>
  );
}

export function ProjectOverviewActivityCard({
  activity,
  projectId,
}: {
  activity: ProjectOverviewActivity;
  projectId: string;
}) {
  const base = `/proyectos/${projectId}`;
  const awaiting = activity.purchaseRequestsAwaitingQuotesCount;
  const prHint =
    awaiting != null && awaiting > 0
      ? `${awaiting} pendiente${awaiting === 1 ? "" : "s"} de cotización`
      : undefined;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Actividad y gestión</CardTitle>
        <CardDescription>Conteos del proyecto según tus permisos y módulos habilitados.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Cell label="Certificaciones" value={activity.certificationsCount} href={`${base}/certificaciones`} />
          <Cell
            label="Solicitudes de compra"
            value={activity.purchaseRequestsCount}
            href={`${base}/solicitudes-compra`}
            hint={prHint}
            hintHref={prHint ? `${base}/solicitudes-compra?status=SUBMITTED` : undefined}
          />
          <Cell label="Órdenes de compra" value={activity.purchaseOrdersCount} href={`${base}/ordenes-compra`} />
          <Cell label="Subcontratos" value={activity.subcontractsCount} href={`${base}/subcontratos`} />
          <Cell label="Documentos" value={activity.documentsCount} href={`${base}/documentos`} />
          <Cell label="Partes de obra" value={activity.jobsiteLogsCount} href={`${base}/libro-obra`} />
          <Cell label="Movimientos de stock" value={activity.stockMovementsCount} href={`${base}/inventario`} />
        </div>
      </CardContent>
    </Card>
  );
}
