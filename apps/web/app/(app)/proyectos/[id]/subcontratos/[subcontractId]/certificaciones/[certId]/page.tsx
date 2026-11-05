import { formatDate } from "@/lib/format";
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
  getTenantModuleGate,
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
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { ConfirmActionButton } from "@/components/feedback/confirm-action-button";
import { ReasonActionButton } from "@/components/feedback/reason-action-button";
import { SubcontractActionButton } from "@/features/subcontracts/components/subcontract-action-button";
import { Button } from "@/components/ui/button";
import {
  formatMoneyAmount,
  formatQtyFromString,
  formatUnitPriceFromString,
} from "@/lib/format-money";

interface PageProps {
  params: Promise<{ id: string; subcontractId: string; certId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

export default async function CertificacionPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId, certId } = await params;
  const sp = await searchParams;
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
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  if (cert.projectId !== projectId) notFound();
  if (cert.subcontractId !== subcontractId) notFound();

  const certAttachments = await listEntityDocuments("SUBCONTRACT_CERTIFICATION", certId, ctx, {
    projectId,
  });
  const storageConfigured = isStorageConfigured();
  const canEditSubcontracts = can(current.tenantCtx.roles, "EDIT", "SUBCONTRACTS");
  const canEditAttachments = canEditSubcontracts;
  const moduleGate = await getTenantModuleGate(ctx);
  const canViewAp = moduleGate.isEnabled("AP") && can(current.tenantCtx.roles, "VIEW", "AP");
  const canEditAp = moduleGate.isEnabled("AP") && can(current.tenantCtx.roles, "EDIT", "AP");

  return (
    <PageShell
      variant="default"
      className="space-y-6"
      breadcrumbLabel={cert.code}
      breadcrumbSegmentLabels={{ [subcontractId]: cert.subcontractCode }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{cert.code}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <SubcontractCertificationStatusBadge status={cert.status} />
              <span className="text-sm text-muted-foreground">{cert.subcontractorName}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditSubcontracts && cert.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${certId}/editar`}
                >
                  Editar
                </Link>
              </Button>
              <SubcontractActionButton
                label="Emitir"
                action={issueSubcontractCertificationAction.bind(
                  null,
                  certId,
                  subcontractId,
                  projectId,
                )}
              />
            </>
          )}
          {canEditSubcontracts && cert.status === "ISSUED" && (
            <>
              <SubcontractActionButton
                label="Aprobar"
                action={approveSubcontractCertificationAction.bind(
                  null,
                  certId,
                  subcontractId,
                  projectId,
                )}
              />
              <ConfirmActionButton
                label="Rechazar"
                title="Rechazar certificación"
                description="La certificación quedará rechazada. Podés emitir una sucesora si el flujo lo permite."
                confirmLabel="Rechazar"
                variant="outline"
                className="text-destructive"
                successMessage="Certificación rechazada"
                action={rejectSubcontractCertificationAction.bind(
                  null,
                  certId,
                  subcontractId,
                  projectId,
                )}
              />
            </>
          )}
          {canEditSubcontracts &&
            (cert.status === "DRAFT" || cert.status === "ISSUED" || cert.status === "APPROVED") && (
              <ReasonActionButton
                requiresReason={cert.status !== "DRAFT"}
                label="Anular"
                title="Anular certificación"
                description="La certificación de subcontrato se anulará."
                confirmLabel="Anular"
                variant="outline"
                className="text-destructive"
                successMessage="Certificación anulada"
                action={cancelSubcontractCertificationAction.bind(
                  null,
                  certId,
                  subcontractId,
                  projectId,
                )}
              />
            )}
          {canEditSubcontracts && cert.status === "REJECTED" && (
            <Button size="sm" asChild>
              <Link
                href={
                  cert.successorCertificationId
                    ? `/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${cert.successorCertificationId}`
                    : `/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/nueva?replaces=${certId}`
                }
              >
                {cert.successorCertificationId ? "Ver nueva versión" : "Nueva versión"}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <ActionErrorBanner message={sp.actionError} />

      {cert.replacesCertificationId && (
        <p className="text-sm text-muted-foreground">
          Esta certificación reemplaza a una versión rechazada anterior.
        </p>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          <p className="text-xl font-semibold mt-1">
            {formatMoneyAmount(cert.totalAmount, cert.currency)}
          </p>
        </div>
      </div>

      {cert.status === "APPROVED" && (
        <div role="status" className="rounded-lg border bg-card p-4 text-sm">
          <p className="font-medium">
            Liquidación:{" "}
            {cert.settlementStatus
              ? {
                  UNSETTLED: "Sin liquidar",
                  PARTIALLY_SETTLED: "Liquidado parcialmente",
                  SETTLED: "Sin saldo pendiente",
                  OVERDUE: "Vencido",
                }[cert.settlementStatus]
              : "No disponible"}
          </p>
          {cert.settlementUnavailableReason && (
            <p className="mt-1 text-muted-foreground">{cert.settlementUnavailableReason}</p>
          )}
        </div>
      )}

      {canViewAp && cert.status === "APPROVED" && cert.supplierInvoiceId && (
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
                {cert.supplierInvoiceStatus === "DRAFT" && canEditAp
                  ? "Revisar y emitir factura"
                  : "Ver factura"}
              </Link>
            </Button>
          </div>
        </div>
      )}

      {canViewAp && cert.status === "APPROVED" && !cert.supplierInvoiceId && (
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
                  <TableCell className="text-right">
                    {formatUnitPriceFromString(l.unitPriceSnapshot)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatQtyFromString(l.previousQty)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatQtyFromString(l.currentQty)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQtyFromString(l.cumulativeQty)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatQtyFromString(l.remainingQty)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatMoneyAmount(l.lineTotal, cert.currency)}
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
                  {formatMoneyAmount(cert.totalAmount, cert.currency)}
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
