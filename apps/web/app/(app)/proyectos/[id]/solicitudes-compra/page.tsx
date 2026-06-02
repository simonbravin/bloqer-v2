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
import { PurchaseRequestStatusBadge } from "@/features/procurement/components/purchase-request-status-badge";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { formatDate } from "@/lib/format";
import { getProjectShellInfo, listPurchaseRequestsByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SolicitudesCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectShellInfo(id, ctx);
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
  const canCreate = can(current.tenantCtx.roles, "EDIT", "PURCHASE_REQUESTS");

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Solicitudes de compra"
        subtitle={`${requests.length} ${requests.length === 1 ? "solicitud" : "solicitudes"}`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href={`/proyectos/${id}/solicitudes-compra/nueva`}>Nueva solicitud</Link>
            </Button>
          ) : undefined
        }
      />

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
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-8">
                  No hay solicitudes de compra en este proyecto.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((pr) => (
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
