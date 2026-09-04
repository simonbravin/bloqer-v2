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
  ProcurementQuotesSection,
} from "@/features/procurement/components/procurement-quotes-section";
import { PurchaseRequestAwardMatrix } from "@/features/procurement/components/purchase-request-award-matrix";
import type { SupplierOption } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatQtyFromString, formatUnitPriceFromString } from "@/lib/format-money";
import {
  submitPurchaseRequestAction,
  cancelPurchaseRequestAction,
} from "../actions";
import {
  canEditPurchaseRequests,
  canManageProcurementQuotes,
  getPurchaseRequestById,
  getPurchaseRequestPoLinks,
  listEntityDocuments,
  listProcurementQuotesDetailedForRequest,
  listAllContacts,
  ServiceError,
} from "@bloqer/services";
import { PurchaseRequestDetailMobileSections } from "@/features/procurement/components/purchase-request-detail-mobile-sections";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { PageShell } from "@/components/layout/page-shell";
import { toContactPickerOption } from "@/lib/searchable-options";
import { Button } from "@/components/ui/button";
import { EntityDocumentsPanel } from "@/features/documents";
import { ProcessStepper } from "@/components/ui/process-stepper";
import { purchaseRequestProcessSteps } from "@/features/procurement/lib/purchase-request-process-steps";
import { isStorageConfigured } from "@bloqer/config";

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
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  if (pr.projectId !== id) notFound();

  let quotes;
  let linkedOrders: Array<{
    id: string;
    code: string;
    status: string;
    projectId: string;
    selectedProcurementQuoteId: string | null;
  }> = [];
  let hasAnyPo;
  let awardedLineCount = 0;
  let totalLineCount = 0;
  try {
    const [quoteRows, poLinks] = await Promise.all([
      listProcurementQuotesDetailedForRequest(prId, ctx),
      getPurchaseRequestPoLinks(prId, ctx),
    ]);
    quotes = quoteRows;
    linkedOrders = poLinks.activeOrders;
    hasAnyPo = poLinks.hasAny;
    awardedLineCount = poLinks.awardedLineCount;
    totalLineCount = poLinks.totalLineCount;
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }
  const canEditPr = canEditPurchaseRequests(current.tenantCtx.roles);
  const canQuote = canManageProcurementQuotes(current.tenantCtx.roles);
  const frozenQuoteIds = [
    ...new Set(
      linkedOrders
        .map((o) => o.selectedProcurementQuoteId)
        .filter((qid): qid is string => Boolean(qid)),
    ),
  ];

  let suppliers: SupplierOption[] = [];
  if (canQuote && pr.status === "SUBMITTED") {
    const suppliersResult = await listAllContacts(
      { role: "SUPPLIER", status: "ACTIVE" },
      ctx,
    );
    suppliers = suppliersResult.map(toContactPickerOption);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">{pr.code}</h1>
          <PurchaseRequestStatusBadge status={pr.status} />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {isDraft && canEditPr && (
            <form
              action={async () => {
                "use server";
                const res = await submitPurchaseRequestAction(prId, id);
                if ("error" in res) redirectWithActionError(prPath, res.error);
                redirect(prPath);
              }}
            >
              <Button type="submit" className="min-h-11 w-full md:min-h-9 sm:w-auto" data-testid="purchase-request-submit">
                Enviar solicitud
              </Button>
            </form>
          )}
          {pr.status !== "CANCELLED" &&
            pr.status !== "COMPLETED" &&
            canEditPr &&
            linkedOrders.length === 0 && (
            <form
              action={async () => {
                "use server";
                const res = await cancelPurchaseRequestAction(prId, id);
                if ("error" in res) redirectWithActionError(prPath, res.error);
                redirect(prPath);
              }}
            >
              <Button type="submit" variant="destructive" className="min-h-11 w-full md:min-h-9 sm:w-auto">
                Anular
              </Button>
            </form>
          )}
        </div>
      </div>

      <ProcessStepper
        aria-label="Progreso de la solicitud de compra"
        steps={purchaseRequestProcessSteps({
          status: pr.status,
          submittedAt: pr.submittedAt,
          quoteCount: quotes.length,
          hasLinkedPo: hasAnyPo,
          awardedLineCount,
          totalLineCount,
        })}
      />

      <ActionErrorBanner message={sp.actionError} />

      {linkedOrders.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
          <p className="text-muted-foreground">
            Cobertura: {awardedLineCount}/{totalLineCount || pr.lines.length} ítems adjudicados
          </p>
          <ul className="space-y-0.5">
            {linkedOrders.map((po) => (
              <li key={po.id}>
                <span className="text-muted-foreground">OC: </span>
                <Link
                  href={`/proyectos/${id}/ordenes-compra/${po.id}`}
                  className="font-medium hover:underline"
                >
                  {po.code}
                </Link>
                <span className="text-muted-foreground"> ({po.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pr.status === "SUBMITTED" && quotes.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm md:hidden">
          Solicitud enviada. Pendiente de cotización.
        </p>
      ) : null}

      <PurchaseRequestDetailMobileSections
        pr={pr}
        projectId={id}
        canAward={canQuote && ["SUBMITTED", "QUOTE_SELECTED"].includes(pr.status)}
        linkedOrders={linkedOrders}
        quotes={quotes.map((q) => ({
          id: q.id,
          supplierName: q.supplierName,
          status: q.status,
          totalAmount: q.totalAmount,
          currency: q.currency,
          leadTimeDays: q.leadTimeDays,
          lines: q.lines,
        }))}
        documents={
          <EntityDocumentsPanel
            scope={{ kind: "project", projectId: id }}
            linkedEntity={{ type: "PURCHASE_REQUEST", id: prId }}
            storageConfigured={storageConfigured}
            docs={prAttachments}
            canEdit={canEditAttachments}
          />
        }
      />

      <div className="hidden md:block rounded-lg border bg-card p-6 space-y-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Solicitante: </span>
            <span className="font-medium">{pr.requestedByName ?? "—"}</span>
          </p>
          {pr.submittedAt ? (
            <p>
              <span className="text-muted-foreground">Enviada: </span>
              {formatDate(pr.submittedAt)}
            </p>
          ) : null}
          <p>
            <span className="text-muted-foreground">Creada: </span>
            {formatDate(pr.createdAt)}
          </p>
        </div>
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
                <TableHead className="text-right">Ref. presup.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pr.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.description}
                    {line.awardedPurchaseOrderId ? (
                      <span className="ml-2 text-xs text-muted-foreground">(adjudicado)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyFromString(line.quantity)}</TableCell>
                  <TableCell className="text-right">{line.unit}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {line.budgetUnitCostSnapshot
                      ? formatUnitPriceFromString(line.budgetUnitCostSnapshot)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </div>

      {showQuotes && (
        <>
          {canQuote && pr.status === "SUBMITTED" ? (
            <PurchaseRequestAwardMatrix
              projectId={id}
              purchaseRequestId={prId}
              prLines={pr.lines}
              quotes={quotes}
              canAward={canQuote}
            />
          ) : null}

          <ProcurementQuotesSection
            projectId={id}
            purchaseRequestId={prId}
            prLines={pr.lines}
            suppliers={suppliers}
            quotes={quotes}
            canQuote={canQuote}
            allowCreateQuotes={pr.status === "SUBMITTED"}
            frozenQuoteIds={frozenQuoteIds}
          />

          {quotes.length > 0 && (
            <div className="hidden md:block space-y-4">
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

      <div className="hidden md:block">
      <EntityDocumentsPanel
        scope={{ kind: "project", projectId: id }}
        linkedEntity={{ type: "PURCHASE_REQUEST", id: prId }}
        storageConfigured={storageConfigured}
        docs={prAttachments}
        canEdit={canEditAttachments}
      />
      </div>
    </PageShell>
  );
}
