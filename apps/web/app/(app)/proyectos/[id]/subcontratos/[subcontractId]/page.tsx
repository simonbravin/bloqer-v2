import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getSubcontractById,
  listSubcontractCertificationsBySubcontract,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import { SubcontractStatusBadge, SubcontractCertificationStatusBadge } from "@/features/subcontracts";
import {
  activateSubcontractAction, completeSubcontractAction,
  cancelSubcontractAction,
} from "../actions";

interface PageProps { params: Promise<{ id: string; subcontractId: string }> }

export default async function SubcontratoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let subcontract, certifications;
  try {
    [subcontract, certifications] = await Promise.all([
      getSubcontractById(subcontractId, ctx),
      listSubcontractCertificationsBySubcontract(subcontractId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (subcontract.projectId !== projectId) notFound();

  const subcontractAttachments = await listEntityDocuments(
    "SUBCONTRACT",
    subcontractId,
    ctx,
    { projectId },
  );
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "SUBCONTRACTS");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/subcontratos`}>← Subcontratos</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{subcontract.code} — {subcontract.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <SubcontractStatusBadge status={subcontract.status} />
              <span className="text-sm text-muted-foreground">{subcontract.subcontractorName}</span>
              <span className="text-sm text-muted-foreground">· {subcontract.currency}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {subcontract.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/editar`}>Editar</Link>
              </Button>
              <form action={async () => { "use server"; await activateSubcontractAction(subcontractId, projectId); }}>
                <Button size="sm" type="submit">Activar</Button>
              </form>
            </>
          )}
          {subcontract.status === "ACTIVE" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/nueva`}>+ Certificación</Link>
              </Button>
              <form action={async () => { "use server"; await completeSubcontractAction(subcontractId, projectId); }}>
                <Button variant="outline" size="sm" type="submit">Finalizar</Button>
              </form>
            </>
          )}
          {(subcontract.status === "DRAFT" || subcontract.status === "ACTIVE") && (
            <form action={async () => { "use server"; await cancelSubcontractAction(subcontractId, projectId); }}>
              <Button variant="outline" size="sm" type="submit" className="text-destructive">Anular</Button>
            </form>
          )}
        </div>
      </div>

      {subcontract.description && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{subcontract.description}</p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Valor del contrato</p>
          <p className="text-xl font-semibold mt-1">
            {parseFloat(subcontract.totalValue).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Certificado</p>
          <p className="text-xl font-semibold mt-1">
            {parseFloat(subcontract.totalCertified).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Saldo a certificar</p>
          <p className="text-xl font-semibold mt-1">
            {(parseFloat(subcontract.totalValue) - parseFloat(subcontract.totalCertified)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Líneas del subcontrato</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Descripción</th>
                <th className="px-4 py-2 text-left">WBS</th>
                <th className="px-4 py-2 text-right">Unidad</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2 text-right">Precio unit.</th>
                <th className="px-4 py-2 text-right">Total línea</th>
                <th className="px-4 py-2 text-right">Certificado</th>
                <th className="px-4 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {subcontract.lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-2">{l.description}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {l.wbsNode ? `[${l.wbsNode.code}] ${l.wbsNode.name}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{l.unit || "—"}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(l.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(l.unitPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right font-medium">{parseFloat(l.lineTotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{parseFloat(l.certifiedQuantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(l.remainingQty).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Certifications */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">Certificaciones</h2>
          {subcontract.status === "ACTIVE" && (
            <Button size="sm" asChild>
              <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/nueva`}>+ Nueva</Link>
            </Button>
          )}
        </div>
        {certifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Sin certificaciones.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Código</th>
                <th className="px-4 py-2 text-left">Período</th>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-left">Factura</th>
              </tr>
            </thead>
            <tbody>
              {certifications.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${c.id}`} className="hover:underline text-primary font-mono text-xs">
                      {c.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {formatDate(c.periodStart)} – {formatDate(c.periodEnd)}
                  </td>
                  <td className="px-4 py-2 text-xs">{formatDate(c.certificationDate)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {parseFloat(c.totalAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2"><SubcontractCertificationStatusBadge status={c.status} /></td>
                  <td className="px-4 py-2">
                    {c.supplierInvoiceId ? (
                      <Link href={`/proyectos/${projectId}/facturas-proveedor/${c.supplierInvoiceId}`} className="text-xs text-primary hover:underline">
                        Ver factura →
                      </Link>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId }}
        linkedEntity={{ type: "SUBCONTRACT", id: subcontractId }}
        storageConfigured={storageConfigured}
        docs={subcontractAttachments}
        canEdit={canEditAttachments}
      />
    </div>
  );
}
