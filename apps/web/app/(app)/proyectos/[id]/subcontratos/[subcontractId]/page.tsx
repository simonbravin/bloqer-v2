import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getSubcontractById,
  listSubcontractCertificationsBySubcontract,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import { addDecimal, multiplyDecimal, serializeMoney } from "@bloqer/utils";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount, formatQtyFromString, formatUnitPriceFromString } from "@/lib/format-money";
import {
  SubcontractStatusBadge,
  SubcontractCertificationStatusBadge,
} from "@/features/subcontracts";
import { PageShell } from "@/components/layout/page-shell";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  activateSubcontractAction,
  completeSubcontractAction,
  cancelSubcontractAction,
} from "../actions";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { ConfirmActionButton } from "@/components/feedback/confirm-action-button";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; subcontractId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

export default async function SubcontratoPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId } = await params;
  const sp = await searchParams;
  const returnPath = `/proyectos/${projectId}/subcontratos/${subcontractId}`;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let subcontract, certifications;
  try {
    [subcontract, certifications] = await Promise.all([
      getSubcontractById(subcontractId, ctx),
      listSubcontractCertificationsBySubcontract(subcontractId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (subcontract.projectId !== projectId) notFound();

  const subcontractAttachments = await listEntityDocuments("SUBCONTRACT", subcontractId, ctx, {
    projectId,
  });
  const storageConfigured = isStorageConfigured();
  const canEditSubcontracts = can(current.tenantCtx.roles, "EDIT", "SUBCONTRACTS");
  const canEditAttachments = canEditSubcontracts;

  const remainingToCertify = serializeMoney(
    addDecimal(subcontract.totalValue, multiplyDecimal(subcontract.totalCertified, "-1")),
  );

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={subcontract.code}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {subcontract.code} — {subcontract.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <SubcontractStatusBadge status={subcontract.status} />
              <span className="text-sm text-muted-foreground">{subcontract.subcontractorName}</span>
              <span className="text-sm text-muted-foreground">· {subcontract.currency}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {canEditSubcontracts && subcontract.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/editar`}>
                  Editar
                </Link>
              </Button>
              <form
                action={async () => {
                  "use server";
                  const res = await activateSubcontractAction(subcontractId, projectId);
                  if ("error" in res) redirectWithActionError(returnPath, res.error);
                  redirect(returnPath);
                }}
              >
                <Button size="sm" type="submit">
                  Activar
                </Button>
              </form>
            </>
          )}
          {canEditSubcontracts && subcontract.status === "ACTIVE" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/nueva`}
                >
                  + Certificación
                </Link>
              </Button>
              <form
                action={async () => {
                  "use server";
                  const res = await completeSubcontractAction(subcontractId, projectId);
                  if ("error" in res) redirectWithActionError(returnPath, res.error);
                  redirect(returnPath);
                }}
              >
                <Button variant="outline" size="sm" type="submit">
                  Finalizar
                </Button>
              </form>
            </>
          )}
          {canEditSubcontracts &&
            (subcontract.status === "DRAFT" || subcontract.status === "ACTIVE") && (
            <ConfirmActionButton
              label="Anular"
              title="Anular subcontrato"
              description="El subcontrato pasará a anulado. No se podrán emitir nuevas certificaciones."
              confirmLabel="Anular"
              variant="outline"
              className="text-destructive"
              successMessage="Subcontrato anulado"
              action={cancelSubcontractAction.bind(null, subcontractId, projectId)}
            />
          )}
        </div>
      </div>

      <ActionErrorBanner message={sp.actionError} />

      {subcontract.description && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{subcontract.description}</p>
        </div>
      )}

      {/* Summary */}
      <KpiStatGrid columns={3}>
        <KpiStatCard
          label="Valor del contrato"
          value={formatMoneyAmount(subcontract.totalValue, subcontract.currency)}
          subtitle={subcontract.currency}
        />
        <KpiStatCard
          label="Certificado"
          value={formatMoneyAmount(subcontract.totalCertified, subcontract.currency)}
          subtitle={subcontract.currency}
        />
        <KpiStatCard
          label="Saldo a certificar"
          value={formatMoneyAmount(remainingToCertify, subcontract.currency)}
          subtitle={subcontract.currency}
        />
      </KpiStatGrid>

      {/* Lines */}
      <DataTableSection title="Líneas del subcontrato">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>EDT</TableHead>
                <TableHead className="text-right">Unidad</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">Total línea</TableHead>
                <TableHead className="text-right">Certificado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subcontract.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.wbsNode ? `[${l.wbsNode.code}] ${l.wbsNode.name}` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {l.unit || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyFromString(l.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUnitPriceFromString(l.unitPrice)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoneyAmount(l.lineTotal, subcontract.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatQtyFromString(l.certifiedQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyFromString(l.remainingQty)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </DataTableSection>

      {/* Certifications */}
      <DataTableSection
        title="Certificaciones"
        actions={
          canEditSubcontracts && subcontract.status === "ACTIVE" ? (
            <Button size="sm" asChild>
              <Link
                href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/nueva`}
              >
                + Nueva
              </Link>
            </Button>
          ) : undefined
        }
      >
        {certifications.length === 0 ? (
          <ListEmptyState message="Sin certificaciones." />
        ) : (
          <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Factura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certifications.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/proyectos/${projectId}/subcontratos/${subcontractId}/certificaciones/${c.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {c.code}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(c.periodStart)} – {formatDate(c.periodEnd)}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(c.certificationDate)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoneyAmount(c.totalAmount, subcontract.currency)}
                  </TableCell>
                  <TableCell>
                    <SubcontractCertificationStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>
                    {c.supplierInvoiceId ? (
                      <Link
                        href={`/proyectos/${projectId}/facturas-proveedor/${c.supplierInvoiceId}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Ver factura →
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </TableScroll>
        )}
      </DataTableSection>

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId }}
        linkedEntity={{ type: "SUBCONTRACT", id: subcontractId }}
        storageConfigured={storageConfigured}
        docs={subcontractAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
