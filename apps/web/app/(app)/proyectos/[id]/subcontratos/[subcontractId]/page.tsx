import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import {
  SubcontractStatusBadge,
  SubcontractCertificationStatusBadge,
} from "@/features/subcontracts";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
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
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; subcontractId: string }>;
}

export default async function SubcontratoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, subcontractId } = await params;
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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (subcontract.projectId !== projectId) notFound();

  const subcontractAttachments = await listEntityDocuments("SUBCONTRACT", subcontractId, ctx, {
    projectId,
  });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "SUBCONTRACTS");

  const fmtMoney = (v: string) =>
    parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href={`/proyectos/${projectId}/subcontratos`} label="Subcontratos" />
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
          {subcontract.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/subcontratos/${subcontractId}/editar`}>
                  Editar
                </Link>
              </Button>
              <form
                action={async () => {
                  "use server";
                  await activateSubcontractAction(subcontractId, projectId);
                }}
              >
                <Button size="sm" type="submit">
                  Activar
                </Button>
              </form>
            </>
          )}
          {subcontract.status === "ACTIVE" && (
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
                  await completeSubcontractAction(subcontractId, projectId);
                }}
              >
                <Button variant="outline" size="sm" type="submit">
                  Finalizar
                </Button>
              </form>
            </>
          )}
          {(subcontract.status === "DRAFT" || subcontract.status === "ACTIVE") && (
            <form
              action={async () => {
                "use server";
                await cancelSubcontractAction(subcontractId, projectId);
              }}
            >
              <Button variant="outline" size="sm" type="submit" className="text-destructive">
                Anular
              </Button>
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
      <KpiStatGrid columns={3}>
        <KpiStatCard
          label="Valor del contrato"
          value={fmtMoney(subcontract.totalValue)}
          subtitle={subcontract.currency}
        />
        <KpiStatCard
          label="Certificado"
          value={fmtMoney(subcontract.totalCertified)}
          subtitle={subcontract.currency}
        />
        <KpiStatCard
          label="Saldo a certificar"
          value={fmtMoney(
            String(parseFloat(subcontract.totalValue) - parseFloat(subcontract.totalCertified)),
          )}
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
                <TableHead>WBS</TableHead>
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
                  <TableCell className="text-right">{fmtMoney(l.quantity)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(l.unitPrice)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(l.lineTotal)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmtMoney(l.certifiedQuantity)}
                  </TableCell>
                  <TableCell className="text-right">{fmtMoney(l.remainingQty)}</TableCell>
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
          subcontract.status === "ACTIVE" ? (
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
                    {fmtMoney(c.totalAmount)}
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
