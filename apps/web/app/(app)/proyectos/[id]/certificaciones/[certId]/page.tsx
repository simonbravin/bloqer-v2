import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  getWbsTree,
  getActiveInvoiceForCertification,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
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

interface PageProps {
  params: Promise<{ id: string; certId: string }>;
}

function flattenItemNodes(
  nodes: Awaited<ReturnType<typeof getWbsTree>>,
): { id: string; code: string; name: string; unit: string }[] {
  const result: { id: string; code: string; name: string; unit: string }[] = [];
  function walk(ns: typeof nodes) {
    for (const n of ns) {
      if (n.type === "ITEM" && n.costItem) {
        result.push({ id: n.id, code: n.code, name: n.name, unit: n.costItem.unit });
      }
      walk(n.children);
    }
  }
  walk(nodes);
  return result;
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
  let wbsTree;
  let existingInvoice: { id: string; code: string } | null = null;
  try {
    cert = await getCertificationById(certId, ctx);
    [wbsTree, existingInvoice] = await Promise.all([
      getWbsTree(cert.budgetId, ctx),
      getActiveInvoiceForCertification(certId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (cert.projectId !== projectId) notFound();

  const certAttachments = await listEntityDocuments("CERTIFICATION", certId, ctx, { projectId });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "CERTIFICATIONS");

  const editable = cert.status === "DRAFT";
  const allItems = flattenItemNodes(wbsTree);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/certificaciones`}>← Certificaciones</Link>
          </Button>
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
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${projectId}/certificaciones/${certId}/editar`}>
                Editar encabezado
              </Link>
            </Button>
          )}
          {cert.status === "APPROVED" && existingInvoice && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${projectId}/facturas/${existingInvoice.id}`}>
                Ver factura ({existingInvoice.code})
              </Link>
            </Button>
          )}
          {cert.status === "APPROVED" && !existingInvoice && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${projectId}/facturas/nueva?certificationId=${certId}`}>
                Generar factura
              </Link>
            </Button>
          )}
        </div>
      </div>

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
    </div>
  );
}
