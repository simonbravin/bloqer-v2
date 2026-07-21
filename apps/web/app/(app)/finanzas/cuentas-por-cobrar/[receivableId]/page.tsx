import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ReceivableStatusBadge } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import {
  getCompanyReceivableById,
  listCollectionsByReceivable,
  ServiceError,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { cancelCompanyReceivableAction } from "../actions";

interface PageProps {
  params: Promise<{ receivableId: string }>;
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

export default async function FinanzasReceivableDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { receivableId } = await params;
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

  const doCancel = async () => {
    "use server";
    await cancelCompanyReceivableAction(receivableId);
  };

  const canCollect = OPEN_STATUSES.has(receivable.status);

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={receivable.clientName}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Cuenta por cobrar (empresa)</h1>
          <ReceivableStatusBadge status={receivable.status} />
        </div>
        <div className="flex items-center gap-2">
          {canCollect && (
            <Button size="sm" asChild>
              <Link href={`/finanzas/cuentas-por-cobrar/${receivableId}/cobrar`}>
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

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Cliente</p>
            <p className="font-medium">{receivable.clientName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Proyecto</p>
            <p className="font-medium">Empresa</p>
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
            <p className="font-medium font-mono">
              {fmtMoney(receivable.originalAmount, receivable.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Cobrado</p>
            <p className="font-medium font-mono">
              {fmtMoney(receivable.paidAmount, receivable.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground font-semibold">Saldo pendiente</p>
            <p className="font-bold font-mono text-lg">
              {fmtMoney(receivable.balanceDue, receivable.currency)}
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
                </div>
                <p className="font-mono font-medium">
                  {fmtMoney(c.amount, c.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DataTableSection>
    </PageShell>
  );
}
