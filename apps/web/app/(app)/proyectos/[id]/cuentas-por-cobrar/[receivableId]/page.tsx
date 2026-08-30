import { cookies } from "next/headers";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ReceivableFieldDetailView, ReceivableStatusBadge } from "@/features/sales-invoices";
import { CollectionTable } from "@/features/collections";
import type { CollectionListItem } from "@/features/collections";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  canMutateArForScope,
  getProjectShellInfo,
  getReceivableById,
  getSalesInvoiceById,
  listCollectionsByReceivable,
  ServiceError,
} from "@bloqer/services";
import { cancelReceivableAction } from "../../facturas/actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { formatMoneyAmount } from "@/lib/format-money";
import { isReceivablesFieldViewport, parseViewportHint, VIEWPORT_COOKIE } from "@/lib/viewport-hint-cookie";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";

interface PageProps {
  params: Promise<{ id: string; receivableId: string }>;
  searchParams: Promise<{ actionError?: string; collected?: string }>;
}

function fmtDate(d: Date) {
  return formatDate(d);
}

function fmtMoney(value: string, currency: string) {
  return formatMoneyAmount(value, currency);
}

const OPEN_STATUSES = new Set(["OPEN", "PARTIAL", "OVERDUE"]);

export default async function ReceivableDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, receivableId } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const hint = parseViewportHint((await cookies()).get(VIEWPORT_COOKIE)?.value);
  const loadField = isReceivablesFieldViewport(hint);

  let receivable;
  let collections;
  let invoiceCode: string | null = null;
  let projectName: string | null = null;
  try {
    [receivable, collections] = await Promise.all([
      getReceivableById(receivableId, ctx, id),
      listCollectionsByReceivable(receivableId, ctx, id),
    ]);
    if (loadField) {
      projectName = (await getProjectShellInfo(id, ctx)).name;
      const invoice = await getSalesInvoiceById(receivable.salesInvoiceId, ctx, id);
      invoiceCode = invoice.code;
    }
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  if (receivable.projectId !== id) notFound();

  const canEditAr = can(current.tenantCtx.roles, "EDIT", "AR");

  const returnPath = `/proyectos/${id}/cuentas-por-cobrar/${receivableId}`;
  const canCollectDesktop = canEditAr && OPEN_STATUSES.has(receivable.status);
  const canCollectField =
    canMutateArForScope(ctx.roles, receivable.projectId) && OPEN_STATUSES.has(receivable.status);
  const canCancel =
    canEditAr && receivable.status !== "CANCELLED" && receivable.status !== "PAID";

  if (loadField) {
    return (
      <PageShell variant="detail" className="space-y-6" breadcrumbLabel={receivable.clientName}>
        <ReceivableFieldDetailView
          clientName={receivable.clientName}
          invoiceCode={invoiceCode}
          invoiceHref={`/proyectos/${id}/facturas/${receivable.salesInvoiceId}`}
          projectName={projectName}
          issueDate={receivable.issueDate}
          dueDate={receivable.dueDate}
          currency={receivable.currency}
          originalAmount={receivable.originalAmount}
          paidAmount={receivable.paidAmount}
          balanceDue={receivable.balanceDue}
          status={receivable.status}
          collections={collections.map((c) => ({
            id: c.id,
            collectionDate: c.collectionDate,
            amount: c.amount,
            currency: c.currency,
            accountName: c.accountName,
            reference: c.reference ?? null,
            href: `/proyectos/${id}/cobranzas/${c.id}`,
          }))}
          canCollect={canCollectField}
          collectHref={
            canCollectField
              ? `/proyectos/${id}/cuentas-por-cobrar/${receivableId}/cobrar`
              : null
          }
          collectedBanner={sp.collected === "1"}
        />
      </PageShell>
    );
  }

  const collectionItems: CollectionListItem[] = collections.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    collectionDate: c.collectionDate,
    accountName: c.accountName,
    currency: c.currency,
    amount: c.amount,
    notes: c.notes,
    status: c.status,
  }));

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={receivable.clientName}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Cuenta por cobrar</h1>
            {receivable.classLabel ? (
              <DocumentClassBadge
                classLabel={receivable.classLabel}
                classFamily={receivable.classFamily}
              />
            ) : null}
            <ReceivableStatusBadge status={receivable.status} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canCollectDesktop && (
            <Button size="sm" asChild>
              <Link href={`/proyectos/${id}/cuentas-por-cobrar/${receivableId}/cobrar`}>
                Registrar cobranza
              </Link>
            </Button>
          )}
          {canCancel && (
            <form
              action={async () => {
                "use server";
                const result = await cancelReceivableAction(receivableId, id);
                if ("error" in result) redirectWithActionError(returnPath, result.error);
                redirect(returnPath);
              }}
            >
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Cancelar
              </Button>
            </form>
          )}
        </div>
      </div>

      <ActionErrorBanner message={sp.actionError} />

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Detalle</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="font-medium">{receivable.clientName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Moneda</dt>
            <dd className="font-medium">{receivable.currency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Emisión</dt>
            <dd className="font-medium">{fmtDate(receivable.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vencimiento</dt>
            <dd className="font-medium">{fmtDate(receivable.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Monto original</dt>
            <dd className="font-medium font-mono">
              {fmtMoney(receivable.originalAmount, receivable.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cobrado</dt>
            <dd className="font-medium font-mono">
              {fmtMoney(receivable.paidAmount, receivable.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground font-semibold">Saldo pendiente</dt>
            <dd className="font-bold font-mono text-lg">
              {fmtMoney(receivable.balanceDue, receivable.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Factura</dt>
            <dd className="font-medium">
              <Link
                href={`/proyectos/${id}/facturas/${receivable.salesInvoiceId}`}
                className="underline underline-offset-2"
              >
                Ver factura
              </Link>
            </dd>
          </div>
          {receivable.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{receivable.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <DataTableSection
        title="Cobranzas"
        actions={
          canCollectDesktop ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${id}/cuentas-por-cobrar/${receivableId}/cobrar`}>
                Registrar cobranza
              </Link>
            </Button>
          ) : undefined
        }
      >
        <CollectionTable collections={collectionItems} projectId={id} />
      </DataTableSection>
    </PageShell>
  );
}
