import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { PurchaseRequestStatusBadge } from "@/features/procurement/components/purchase-request-status-badge";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  canEditPurchaseRequests,
  getProjectShellInfo,
  listPurchaseRequestsByProject,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function SolicitudesCompraPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const statusFilter =
    sp.status === "SUBMITTED" || sp.status === "DRAFT" || sp.status === "QUOTE_SELECTED"
      ? sp.status
      : undefined;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let requests;
  try {
    requests = await listPurchaseRequestsByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const filtered = statusFilter
    ? requests.filter((pr) => pr.status === statusFilter)
    : requests;

  const canCreate = canEditPurchaseRequests(current.tenantCtx.roles);
  const listHref = `/proyectos/${id}/solicitudes-compra`;

  const subtitle =
    statusFilter === "SUBMITTED"
      ? `${filtered.length} enviada${filtered.length === 1 ? "" : "s"} pendiente${filtered.length === 1 ? "" : "s"} de cotización`
      : statusFilter
        ? `${filtered.length} con estado filtrado`
        : `${requests.length} ${requests.length === 1 ? "solicitud" : "solicitudes"}`;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Solicitudes de compra"
        subtitle={subtitle}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href={`/proyectos/${id}/solicitudes-compra/nueva`}>Nueva solicitud</Link>
            </Button>
          ) : undefined
        }
      />

      {statusFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span>
            {statusFilter === "SUBMITTED"
              ? "Mostrando solo solicitudes enviadas (pendientes de cotización)."
              : `Filtro activo: ${statusFilter}.`}
          </span>
          <Button asChild variant="link" size="sm" className="h-auto p-0">
            <Link href={listHref}>Ver todas</Link>
          </Button>
        </div>
      )}

      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Líneas</TableHead>
              <TableHead>Necesaria para</TableHead>
              <TableHead className="text-right">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <ListEmptyState
                    className="rounded-none border-0"
                    title={
                      statusFilter === "SUBMITTED"
                        ? "Sin solicitudes pendientes de cotización"
                        : statusFilter
                          ? "Sin resultados para este filtro"
                          : "Sin solicitudes de compra"
                    }
                    description={
                      statusFilter
                        ? "Probá quitar el filtro o crear una nueva solicitud."
                        : "Pedí materiales u otros ítems antes de generar una orden de compra."
                    }
                    action={
                      canCreate && !statusFilter ? (
                        <Button asChild size="sm">
                          <Link href={`/proyectos/${id}/solicitudes-compra/nueva`}>
                            Nueva solicitud
                          </Link>
                        </Button>
                      ) : statusFilter ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={listHref}>Ver todas</Link>
                        </Button>
                      ) : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((pr) => (
                <TableRow key={pr.id}>
                  <TableCell className="font-medium">{pr.code}</TableCell>
                  <TableCell>
                    <PurchaseRequestStatusBadge status={pr.status} />
                  </TableCell>
                  <TableCell>{pr.lines.length}</TableCell>
                  <TableCell>
                    {pr.neededByDate ? formatDate(pr.neededByDate) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="link" size="sm">
                      <Link href={`/proyectos/${id}/solicitudes-compra/${pr.id}`}>Detalle</Link>
                    </Button>
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
