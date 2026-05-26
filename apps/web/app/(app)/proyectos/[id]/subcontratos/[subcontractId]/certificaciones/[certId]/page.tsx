import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import { getSubcontractCertificationById, listEntityDocuments, ServiceError } from "@bloqer/services";
import { SubcontractCertificationStatusBadge } from "@/features/subcontracts";
import {
  issueSubcontractCertificationAction,
  approveSubcontractCertificationAction,
  rejectSubcontractCertificationAction,
  cancelSubcontractCertificationAction,
} from "../../../actions";

interface PageProps { params: Promise<{ id: string; subcontractId: string; certId: string }> }

export default async function CertificacionPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId, certId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
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

  const certAttachments = await listEntityDocuments(
    "SUBCONTRACT_CERTIFICATION",
    certId,
    ctx,
    { projectId },
  );
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "SUBCONTRACTS");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}`}>← {cert.subcontractCode}</Link>
          </Button>
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
                <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${certId}/editar`}>Editar</Link>
              </Button>
              <form action={async () => { "use server"; await issueSubcontractCertificationAction(certId, subcontractId, projectId); }}>
                <Button size="sm" type="submit">Emitir</Button>
              </form>
            </>
          )}
          {cert.status === "ISSUED" && (
            <>
              <form action={async () => { "use server"; await approveSubcontractCertificationAction(certId, subcontractId, projectId); }}>
                <Button size="sm" type="submit">Aprobar</Button>
              </form>
              <form action={async () => { "use server"; await rejectSubcontractCertificationAction(certId, subcontractId, projectId); }}>
                <Button variant="outline" size="sm" type="submit" className="text-destructive">Rechazar</Button>
              </form>
            </>
          )}
          {(cert.status === "DRAFT" || cert.status === "ISSUED" || cert.status === "APPROVED") && (
            <form action={async () => { "use server"; await cancelSubcontractCertificationAction(certId, subcontractId, projectId); }}>
              <Button variant="outline" size="sm" type="submit" className="text-destructive">Anular</Button>
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
          <p className="text-xl font-semibold mt-1">
            {parseFloat(cert.totalAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {cert.supplierInvoiceId && (
        <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Factura de proveedor vinculada</p>
          <Link href={`/proyectos/${projectId}/facturas-proveedor/${cert.supplierInvoiceId}`} className="text-sm text-primary hover:underline">
            Ver factura →
          </Link>
        </div>
      )}

      {/* Lines */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Detalle de certificación</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Descripción</th>
                <th className="px-4 py-2 text-right">Unidad</th>
                <th className="px-4 py-2 text-right">Precio unit.</th>
                <th className="px-4 py-2 text-right">Ant. certif.</th>
                <th className="px-4 py-2 text-right">Este período</th>
                <th className="px-4 py-2 text-right">Acum. certif.</th>
                <th className="px-4 py-2 text-right">Saldo</th>
                <th className="px-4 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {cert.lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-2">{l.subcontractLine.description}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{l.subcontractLine.unit || "—"}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(l.unitPriceSnapshot).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{parseFloat(l.previousQty).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-medium">{parseFloat(l.currentQty).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(l.cumulativeQty).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{parseFloat(l.remainingQty).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-semibold">{parseFloat(l.lineTotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td colSpan={7} className="px-4 py-2 text-right font-medium">Total:</td>
                <td className="px-4 py-2 text-right font-bold">
                  {parseFloat(cert.totalAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

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
    </div>
  );
}
