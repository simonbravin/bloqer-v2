import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ReceivableStatusBadge } from "@/features/sales-invoices";
import { CollectionTable } from "@/features/collections";
import type { CollectionListItem } from "@/features/collections";
import { getCurrentUser } from "@/lib/auth";
import { getReceivableById, listCollectionsByReceivable, ServiceError } from "@bloqer/services";
import { cancelReceivableAction } from "../../facturas/actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; receivableId: string }>;
}

function fmtDate(d: Date) {
  return formatDate(d);
}

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
}

const OPEN_STATUSES = new Set(["OPEN", "PARTIAL", "OVERDUE"]);

export default async function ReceivableDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, receivableId } = await params;
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
      getReceivableById(receivableId, ctx),
      listCollectionsByReceivable(receivableId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  if (receivable.projectId !== id) notFound();

  const doCancel = async () => {
    "use server";
    await cancelReceivableAction(receivableId, id);
  };

  const canCollect = OPEN_STATUSES.has(receivable.status);

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
            <ReceivableStatusBadge status={receivable.status} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canCollect && (
            <Button size="sm" asChild>
              <Link href={`/proyectos/${id}/cuentas-por-cobrar/${receivableId}/cobrar`}>
                Registrar cobranza
              </Link>
            </Button>
          )}
          {receivable.status !== "CANCELLED" && receivable.status !== "PAID" && (
            <form action={doCancel}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Cancelar
              </Button>
            </form>
          )}
        </div>
      </div>

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
          canCollect ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/proyectos/${id}/cobranzas/nueva?receivableId=${receivableId}`}>
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
