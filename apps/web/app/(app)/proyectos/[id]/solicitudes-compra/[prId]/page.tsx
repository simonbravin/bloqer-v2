import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import {
  ProcurementQuoteForm,
  SelectQuoteButton,
} from "@/features/procurement/components/procurement-quote-form";
import type { SupplierOption } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  canEditPurchaseRequests,
  canManageProcurementQuotes,
  getActivePurchaseOrderForRequest,
  getPurchaseRequestById,
  listProcurementQuotesForRequest,
  listContacts,
  ServiceError,
} from "@bloqer/services";
import { ProcurementQuoteStatusBadge } from "@/features/procurement/components/procurement-quote-status-badge";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { EntityDocumentsPanel } from "@/features/documents";
import { isStorageConfigured } from "@bloqer/config";
import { listEntityDocuments } from "@bloqer/services";
import {
  submitPurchaseRequestAction,
  cancelPurchaseRequestAction,
} from "../actions";

interface PageProps {
  params: Promise<{ id: string; prId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

export default async function SolicitudCompraDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, prId } = await params;
  const sp = await searchParams;
  const prPath = `/proyectos/${id}/solicitudes-compra/${prId}`;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let pr;
  try {
    pr = await getPurchaseRequestById(prId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }
  if (pr.projectId !== id) notFound();

  let quotes;
  let linkedPo;
  try {
    [quotes, linkedPo] = await Promise.all([
      listProcurementQuotesForRequest(prId, ctx),
      getActivePurchaseOrderForRequest(prId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }
  const canEditPr = canEditPurchaseRequests(current.tenantCtx.roles);
  const canQuote = canManageProcurementQuotes(current.tenantCtx.roles);

  let suppliers: SupplierOption[] = [];
  if (canQuote && ["SUBMITTED", "QUOTE_SELECTED"].includes(pr.status)) {
    const suppliersResult = await listContacts(
      { role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 },
      ctx,
    );
    suppliers = suppliersResult.data.map((c) => ({
      id: c.id,
      label: c.fantasyName ?? c.legalName,
    }));
  }

  const isDraft = pr.status === "DRAFT";
  const showQuotes = ["SUBMITTED", "QUOTE_SELECTED"].includes(pr.status);
  const storageConfigured = isStorageConfigured();
  const prAttachments = await listEntityDocuments("PURCHASE_REQUEST", prId, ctx, { projectId: id });
  const canEditAttachments =
    canEditPurchaseRequests(current.tenantCtx.roles) ||
    canManageProcurementQuotes(current.tenantCtx.roles);

  const quoteAttachments = showQuotes
    ? await Promise.all(
        quotes.map(async (q) => ({
          quoteId: q.id,
          supplierName: q.supplierName,
          docs: await listEntityDocuments("PROCUREMENT_QUOTE", q.id, ctx, { projectId: id }),
        })),
      )
    : [];

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={pr.code}>
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">{pr.code}</h1>
        <PurchaseRequestStatusBadge status={pr.status} />
      </div>

      <ActionErrorBanner message={sp.actionError} />

      {linkedPo && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Orden de compra vinculada: </span>
          <Link
            href={`/proyectos/${id}/ordenes-compra/${linkedPo.id}`}
            className="font-medium hover:underline"
          >
            {linkedPo.code}
          </Link>
          <span className="text-muted-foreground"> ({linkedPo.status})</span>
        </div>
      )}

      <div className="rounded-lg border bg-card p-6 space-y-4 text-sm">
        {pr.neededByDate && (
          <p>
            <span className="text-muted-foreground">Necesaria para: </span>
            {formatDate(pr.neededByDate)}
          </p>
        )}
        {pr.notes && (
          <p>
            <span className="text-muted-foreground">Notas: </span>
            {pr.notes}
          </p>
        )}

        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Unidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pr.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right">{line.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </div>

      <div className="flex gap-2 flex-wrap">
        {isDraft && canEditPr && (
          <form
            action={async () => {
              "use server";
              const res = await submitPurchaseRequestAction(prId, id);
              if ("error" in res) redirectWithActionError(prPath, res.error);
              redirect(prPath);
            }}
          >
            <Button type="submit">Enviar solicitud</Button>
          </form>
        )}
        {pr.status !== "CANCELLED" && pr.status !== "COMPLETED" && canEditPr && (
          <form
            action={async () => {
              "use server";
              const res = await cancelPurchaseRequestAction(prId, id);
              if ("error" in res) redirectWithActionError(prPath, res.error);
              redirect(prPath);
            }}
          >
            <Button type="submit" variant="destructive">
              Anular
            </Button>
          </form>
        )}
      </div>

      {showQuotes && (
        <>
          <h2 className="text-lg font-semibold">Cotizaciones</h2>
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Sin cotizaciones cargadas.
                    </TableCell>
                  </TableRow>
                ) : (
                  quotes.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>{q.supplierName}</TableCell>
                      <TableCell>
                        <ProcurementQuoteStatusBadge status={q.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {q.totalAmount} {q.currency}
                      </TableCell>
                      <TableCell className="text-right">
                        {q.status === "RECEIVED" && canQuote && (
                          <SelectQuoteButton
                            quoteId={q.id}
                            projectId={id}
                            purchaseRequestId={prId}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableScroll>

          {canQuote && suppliers.length > 0 && (
            <ProcurementQuoteForm
              projectId={id}
              purchaseRequestId={prId}
              suppliers={suppliers}
              lines={pr.lines}
            />
          )}
          {canQuote && suppliers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay proveedores activos para cargar cotizaciones.
            </p>
          )}

          {quotes.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Adjuntos por cotización</h3>
              {quoteAttachments.map((qa) => (
                <div key={qa.quoteId} className="rounded-lg border p-4 space-y-2">
                  <p className="text-sm font-medium">{qa.supplierName}</p>
                  <EntityDocumentsPanel
                    scope={{ kind: "project", projectId: id }}
                    linkedEntity={{ type: "PROCUREMENT_QUOTE", id: qa.quoteId }}
                    storageConfigured={storageConfigured}
                    docs={qa.docs}
                    canEdit={canQuote}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId: id }}
        linkedEntity={{ type: "PURCHASE_REQUEST", id: prId }}
        storageConfigured={storageConfigured}
        docs={prAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
