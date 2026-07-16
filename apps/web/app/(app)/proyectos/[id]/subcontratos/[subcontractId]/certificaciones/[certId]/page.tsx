import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getSubcontractCertificationById,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import { SupplierInvoiceStatusBadge } from "@/features/ap";
import { SubcontractCertificationStatusBadge } from "@/features/subcontracts";
import { PageShell } from "@/components/layout/page-shell";
import {
  issueSubcontractCertificationAction,
  approveSubcontractCertificationAction,
  rejectSubcontractCertificationAction,
  cancelSubcontractCertificationAction,
} from "../../../actions";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; subcontractId: string; certId: string }>;
}

function formatAmount(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

export default async function CertificacionPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId, certId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let cert;
  try {
    cert = await getSubcontractCertificationById(certId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (cert.projectId !== projectId) notFound();
  if (cert.subcontractId !== subcontractId) notFound();

  const certAttachments = await listEntityDocuments("SUBCONTRACT_CERTIFICATION", certId, ctx, {
    projectId,
  });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "SUBCONTRACTS");

  return (
    <PageShell
      variant="default"
      className="space-y-6"
      breadcrumbLabel={cert.code}
      breadcrumbSegmentLabels={{ [subcontractId]: cert.subcontractCode }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{cert.code}</h1>
            <div className="flex items-center gap-2 mt-1">
              <SubcontractCertificationStatusBadge status={cert.status} />
              <span className="text-sm text-muted-foreground">{cert.subcontractorName}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {cert.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${certId}/editar`}
                >
                  Editar
                </Link>
              </Button>
              <form
                action={async () => {
                  "use server";
                  await issueSubcontractCertificationAction(certId, subcontractId, projectId);
                }}
              >
                <Button size="sm" type="submit">
                  Emitir
                </Button>
              </form>
            </>
          )}
          {cert.status === "ISSUED" && (
            <>
              <form
                action={async () => {
                  "use server";
                  await approveSubcontractCertificationAction(certId, subcontractId, projectId);
                }}
              >
                <Button size="sm" type="submit">
                  Aprobar
                </Button>
              </form>
              <form
                action={async () => {
                  "use server";
                  await rejectSubcontractCertificationAction(certId, subcontractId, projectId);
                }}
              >
                <Button variant="outline" size="sm" type="submit" className="text-destructive">
                  Rechazar
                </Button>
              </form>
            </>
          )}
          {(cert.status === "DRAFT" || cert.status === "ISSUED" || cert.status === "APPROVED") && (
            <form
              action={async () => {
                "use server";
                await cancelSubcontractCertificationAction(certId, subcontractId, projectId);
              }}
            >
              <Button variant="outline" size="sm" type="submit" className="text-destructive">
                Anular
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Período</p>
          <p className="text-sm font-medium mt-1">
            {formatDate(cert.periodStart)} – {formatDate(cert.periodEnd)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Fecha de certificación</p>
          <p className="text-sm font-medium mt-1">{formatDate(cert.certificationDate)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Total certificado</p>
          <p className="text-xl font-semibold mt-1">{formatAmount(cert.totalAmount)}</p>
        </div>
      </div>

      {cert.status === "APPROVED" && cert.supplierInvoiceId && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Factura proveedor generada</p>
                {cert.supplierInvoiceStatus && (
                  <SupplierInvoiceStatusBadge status={cert.supplierInvoiceStatus} />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {cert.supplierInvoiceStatus === "DRAFT"
                  ? `Al aprobar la certificación se creó ${cert.supplierInvoiceCode ?? "la factura"} en borrador. Revisala y emitila para que impacte en Cuentas por pagar.`
                  : cert.supplierInvoiceStatus === "ISSUED"
                    ? `${cert.supplierInvoiceCode ?? "La factura"} ya fue emitida e impacta en Cuentas por pagar.`
                    : `${cert.supplierInvoiceCode ?? "La factura"} fue anulada. Revisá su detalle antes de continuar.`}
              </p>
            </div>
            <Button
              asChild
              size="sm"
              variant={cert.supplierInvoiceStatus === "CANCELLED" ? "outline" : "default"}
            >
              <Link href={`/proyectos/${projectId}/facturas-proveedor/${cert.supplierInvoiceId}`}>
                {cert.supplierInvoiceStatus === "DRAFT"
                  ? "Revisar y emitir factura"
                  : "Ver factura"}
              </Link>
            </Button>
          </div>
        </div>
      )}

      {cert.status === "APPROVED" && !cert.supplierInvoiceId && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          Certificación aprobada sin factura proveedor vinculada. Revisá el log de aprobación o
          contactá a administración antes de crear documentos manuales.
        </div>
      )}

      {/* Lines */}
      <DataTableSection title="Detalle de certificación">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Unidad</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">Ant. certif.</TableHead>
                <TableHead className="text-right">Este período</TableHead>
                <TableHead className="text-right">Acum. certif.</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cert.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.subcontractLine.description}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {l.subcontractLine.unit || "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatAmount(l.unitPriceSnapshot)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatAmount(l.previousQty)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatAmount(l.currentQty)}
                  </TableCell>
                  <TableCell className="text-right">{formatAmount(l.cumulativeQty)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatAmount(l.remainingQty)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatAmount(l.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="bg-muted/30">
              <TableRow>
                <TableCell colSpan={7} className="text-right font-medium">
                  Total:
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatAmount(cert.totalAmount)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableScroll>
      </DataTableSection>

      {cert.notes && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase mb-1">Notas</p>
          <p className="text-sm">{cert.notes}</p>
        </div>
      )}

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId }}
        linkedEntity={{ type: "SUBCONTRACT_CERTIFICATION", id: certId, subcontractId }}
        storageConfigured={storageConfigured}
        docs={certAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
