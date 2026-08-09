import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CertificationStatusBadge,
  CertificationLineEditor,
  CertificationTotalsPanel,
} from "@/features/certifications";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getCertificationById,
  getActiveInvoiceForCertification,
  listCertificationWbsHints,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import {
  issueCertificationAction,
  approveCertificationAction,
  rejectCertificationAction,
  cancelCertificationAction,
  addCertificationLineAction,
  updateCertificationLineAction,
  removeCertificationLineAction,
  refreshPreviousQtyAction,
} from "../actions";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; certId: string }>;
}

export default async function CertificacionDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, certId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let cert;
  let allItems: Awaited<ReturnType<typeof listCertificationWbsHints>> = [];
  let existingInvoice: Awaited<ReturnType<typeof getActiveInvoiceForCertification>> = null;
  try {
    cert = await getCertificationById(certId, ctx);
    [allItems, existingInvoice] = await Promise.all([
      listCertificationWbsHints(certId, ctx),
      getActiveInvoiceForCertification(certId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (cert.projectId !== projectId) notFound();

  const certAttachments = await listEntityDocuments("CERTIFICATION", certId, ctx, { projectId });
  const storageConfigured = isStorageConfigured();
  const canEditCert = can(current.tenantCtx.roles, "EDIT", "CERTIFICATIONS");
  const canApproveCert = can(current.tenantCtx.roles, "APPROVE", "CERTIFICATIONS");
  const canEditAttachments = canEditCert;
  const canEditAr = can(current.tenantCtx.roles, "EDIT", "AR");

  const editable = canEditCert && cert.status === "DRAFT";
  const invoiceDraft = existingInvoice?.status === "DRAFT";
  const invoiceIssued = existingInvoice?.status === "ISSUED";

  return (
    <PageShell variant="default" className="space-y-4" breadcrumbLabel={cert.code}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{cert.code}</h1>
            <CertificationStatusBadge status={cert.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(cert.periodStart)}
            {" — "}
            {formatDate(cert.periodEnd)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${projectId}/certificaciones/${certId}/editar`}>
                Editar encabezado
              </Link>
            </Button>
          )}
          {canEditAr && cert.status === "APPROVED" && !existingInvoice && (
            <Button size="sm" asChild>
              <Link href={`/proyectos/${projectId}/facturas/nueva?certificationId=${certId}`}>
                Crear borrador de factura
              </Link>
            </Button>
          )}
          {canEditAr && cert.status === "APPROVED" && invoiceDraft && existingInvoice && (
            <Button size="sm" asChild>
              <Link href={`/proyectos/${projectId}/facturas/${existingInvoice.id}`}>
                Emitir factura ({existingInvoice.code})
              </Link>
            </Button>
          )}
          {cert.status === "APPROVED" && invoiceIssued && existingInvoice && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/facturas/${existingInvoice.id}`}>
                  Ver factura ({existingInvoice.code})
                </Link>
              </Button>
              {canEditAr && existingInvoice.canCollect && existingInvoice.receivableId ? (
                <Button size="sm" asChild>
                  <Link
                    href={`/proyectos/${projectId}/cuentas-por-cobrar/${existingInvoice.receivableId}/cobrar`}
                  >
                    Registrar cobranza
                  </Link>
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {cert.status === "APPROVED" && !existingInvoice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100">
          <p className="font-medium">Certificación aprobada pendiente de facturación</p>
          <p className="mt-1 text-xs">
            La aprobación no acredita banco ni abre CxC. Creá un borrador de factura y después{" "}
            <strong>Emití</strong> para abrir la cuenta por cobrar; la cobranza (con cuenta de
            tesorería) es el paso que impacta caja/banco.
          </p>
        </div>
      )}

      {cert.status === "APPROVED" && invoiceDraft && existingInvoice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">Factura en borrador ({existingInvoice.code})</p>
          <p className="mt-1 text-xs">
            Todavía no hay CxC. Usá <strong>Emitir factura</strong> arriba para abrir la cuenta por
            cobrar. La certificación no mueve tesorería.
          </p>
        </div>
      )}

      {cert.status === "APPROVED" && invoiceIssued && existingInvoice && (
        <div className="rounded-lg border bg-card px-4 py-3 text-sm">
          <p className="font-medium">Factura emitida ({existingInvoice.code})</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {existingInvoice.canCollect
              ? "Hay CxC pendiente. Registrá la cobranza para acreditar la cuenta de tesorería."
              : "La factura ya está emitida. Revisá la CxC vinculada si hace falta."}
          </p>
        </div>
      )}

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <CertificationLineEditor
            certificationId={certId}
            lines={cert.lines}
            availableItems={allItems}
            currency={cert.currency}
            editable={editable}
            onAddLine={addCertificationLineAction}
            onUpdateLine={updateCertificationLineAction}
            onRemoveLine={removeCertificationLineAction}
            onRefresh={refreshPreviousQtyAction.bind(null, certId)}
          />
        </div>

        <div className="w-56 shrink-0">
          <CertificationTotalsPanel
            status={cert.status}
            currency={cert.currency}
            totalAmount={cert.totalAmount}
            canEdit={canEditCert}
            canApprove={canApproveCert}
            onIssue={issueCertificationAction.bind(null, certId)}
            onApprove={approveCertificationAction.bind(null, certId)}
            onReject={rejectCertificationAction.bind(null, certId)}
            onCancel={cancelCertificationAction.bind(null, certId)}
          />
        </div>
      </div>

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId }}
        linkedEntity={{ type: "CERTIFICATION", id: certId }}
        storageConfigured={storageConfigured}
        docs={certAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
