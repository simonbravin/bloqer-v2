import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { notFound, redirect } from "next/navigation";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ReceivableFieldDetailView, ReceivableStatusBadge } from "@/features/sales-invoices";
import { RegisterCompanyCollectionDialog } from "@/features/collections";
import { EntityDocumentsPanel } from "@/features/documents";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { isStorageConfigured } from "@bloqer/config";
import { can } from "@bloqer/domain";
import {
  canMutateArForScope,
  getCompanyReceivableById,
  listCollectionsByReceivable,
  listEntityDocuments,
  listSelectableTreasuryAccounts,
  getTenantModuleGate,
  ServiceError,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { ReasonActionButton } from "@/components/feedback/reason-action-button";
import { cancelCompanyReceivableAction, cancelCompanyCollectionAction } from "../actions";
import { isReceivablesFieldViewport, parseViewportHint, VIEWPORT_COOKIE } from "@/lib/viewport-hint-cookie";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";

interface PageProps {
  params: Promise<{ receivableId: string }>;
  searchParams: Promise<{ actionError?: string; collected?: string; cobrar?: string }>;
}

const OPEN_STATUSES = new Set(["OPEN", "PARTIAL", "OVERDUE"]);

export default async function FinanzasReceivableDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { receivableId } = await params;
  const sp = await searchParams;
  const openCobrarDeepLink = sp.cobrar === "1";
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let receivable;
  let collections;
  try {
    [receivable, collections] = await Promise.all([
      getCompanyReceivableById(receivableId, ctx),
      listCollectionsByReceivable(receivableId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  const hint = parseViewportHint((await cookies()).get(VIEWPORT_COOKIE)?.value);
  const loadField = isReceivablesFieldViewport(hint);
  const canEditAr = can(current.tenantCtx.roles, "EDIT", "AR");
  const gate = await getTenantModuleGate(ctx);
  const treasuryEnabled = gate.isEnabled("TREASURY");
  const canCollect = canEditAr && treasuryEnabled && OPEN_STATUSES.has(receivable.status);
  const canCancel =
    canEditAr && receivable.status !== "CANCELLED" && receivable.status !== "PAID";

  if (loadField) {
    const canCollectField =
      treasuryEnabled && canMutateArForScope(ctx.roles, receivable.projectId) && OPEN_STATUSES.has(receivable.status);
    return (
      <PageShell variant="detail" className="space-y-6" breadcrumbLabel={receivable.clientName}>
        <ReceivableFieldDetailView
          clientName={receivable.clientName}
          invoiceCode={receivable.salesInvoiceCode}
          invoiceHref={`/finanzas/facturas/${receivable.salesInvoiceId}`}
          projectName={null}
          issueDate={receivable.issueDate}
          dueDate={receivable.dueDate}
          currency={receivable.currency}
          originalAmount={receivable.originalAmount}
          paidAmount={receivable.paidAmount}
          creditedAmount={receivable.creditedAmount}
          balanceDue={receivable.balanceDue}
          status={receivable.status}
          collections={collections.map((c) => ({
            id: c.id,
            collectionDate: c.collectionDate,
            amount: c.amount,
            currency: c.currency,
            accountName: c.accountName,
            reference: c.reference ?? null,
            status: c.status,
            href: null,
          }))}
          canCollect={canCollectField}
          collectHref={
            canCollectField ? `/finanzas/cuentas-por-cobrar/${receivableId}/cobrar` : null
          }
          collectedBanner={sp.collected === "1"}
        />
      </PageShell>
    );
  }

  const invoiceAttachments = await listEntityDocuments(
    "SALES_INVOICE",
    receivable.salesInvoiceId,
    ctx,
    {},
  );
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = canEditAr;
  const detailPath = `/finanzas/cuentas-por-cobrar/${receivableId}`;

  let activeAccounts: Array<{ id: string; name: string; currency: string }> = [];
  if (canCollect) {
    try {
      const accounts = await listSelectableTreasuryAccounts(ctx);
      activeAccounts = accounts
        .filter((a) => a.status === "ACTIVE" && (!a.companyId || a.companyId === receivable.companyId))
        .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
    } catch (err) {
      if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
    }
  }

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={receivable.clientName}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Cuenta por cobrar (empresa)</h1>
          {receivable.classLabel ? (
            <DocumentClassBadge
              classLabel={receivable.classLabel}
              classFamily={receivable.classFamily}
            />
          ) : null}
          <ReceivableStatusBadge status={receivable.status} />
        </div>
        <div className="flex items-center gap-2">
          {canCollect ? (
            <Suspense fallback={<Button size="sm" disabled>Registrar cobranza</Button>}>
              <RegisterCompanyCollectionDialog
                receivableId={receivableId}
                receivableBalance={receivable.balanceDue}
                receivableCurrency={receivable.currency}
                accounts={activeAccounts}
                defaultOpen={openCobrarDeepLink}
              />
            </Suspense>
          ) : null}
          {canCancel && (
            <ReasonActionButton label="Cancelar CxC" title="Cancelar cuenta por cobrar" confirmLabel="Cancelar CxC"
              description="Se cancela la obligación cuando sus documentos y los controles financieros lo permiten."
              action={cancelCompanyReceivableAction.bind(null, receivableId)} />
          )}
        </div>
      </div>

      <ActionErrorBanner message={sp.actionError} />
      {!treasuryEnabled && OPEN_STATUSES.has(receivable.status) ? <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Tesorería no está disponible. Podés consultar la cuenta por cobrar; para registrar o cancelar cobranzas necesitás habilitar ese módulo.</p> : null}

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Cliente</p>
            <p className="font-medium">{receivable.clientName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Proyecto</p>
            <p className="font-medium">{receivable.projectName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Factura</p>
            <p className="font-medium">
              {receivable.salesInvoiceId && receivable.salesInvoiceCode ? (
                <Link
                  href={`/finanzas/facturas/${receivable.salesInvoiceId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {receivable.salesInvoiceCode}
                </Link>
              ) : (
                (receivable.salesInvoiceCode ?? "—")
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda</p>
            <p className="font-medium">{receivable.currency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Emisión</p>
            <p className="font-medium">{formatDate(receivable.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Vencimiento</p>
            <p className="font-medium">{formatDate(receivable.dueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Monto original</p>
            <p className="font-medium tabular-nums">
              {formatMoneyAmount(receivable.originalAmount, receivable.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Cobrado</p>
            <p className="font-medium tabular-nums">
              {formatMoneyAmount(receivable.paidAmount, receivable.currency)}
            </p>
          </div>
          {Number(receivable.creditedAmount) > 0 ? (
            <div>
              <p className="text-muted-foreground">Créditos NC</p>
              <p className="font-medium tabular-nums">
                {formatMoneyAmount(receivable.creditedAmount, receivable.currency)}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-muted-foreground font-semibold">Saldo pendiente</p>
            <p className="font-bold tabular-nums text-lg">
              {formatMoneyAmount(receivable.balanceDue, receivable.currency)}
            </p>
          </div>
        </div>
      </div>

      <DataTableSection title="Cobranzas">
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1 py-2">Sin cobranzas registradas.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {collections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{formatDate(c.collectionDate)}</p>
                  <p className="text-muted-foreground">{c.accountName}</p>
                  <p className="text-xs font-medium">{c.status === "CANCELLED" ? "Cancelada · sin efecto en el saldo" : "Confirmada"}</p>
                </div>
                <p className="font-medium tabular-nums">
                  {formatMoneyAmount(c.amount, c.currency)}
                </p>
                {canEditAr && treasuryEnabled && c.status === "CONFIRMED" ? <ReasonActionButton label="Cancelar cobranza" title="Cancelar cobranza" confirmLabel="Cancelar cobranza" description="Se revierte el cobro en la CxC y tesorería, si los controles lo permiten." action={cancelCompanyCollectionAction.bind(null, receivableId, c.id)} /> : null}
              </li>
            ))}
          </ul>
        )}
      </DataTableSection>

      <EntityDocumentsPanel
        scope={{ kind: "company-finanzas", afterUploadPath: detailPath }}
        linkedEntity={{ type: "SALES_INVOICE", id: receivable.salesInvoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
