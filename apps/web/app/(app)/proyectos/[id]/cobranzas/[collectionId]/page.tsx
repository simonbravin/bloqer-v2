import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CollectionStatusBadge } from "@/features/collections";
import { settlementMethodLabel } from "@/features/treasury/lib/settlement-method-label";
import { getCurrentUser } from "@/lib/auth";
import { generateJournalFromCollectionAction } from "@/app/(app)/contabilidad/source-draft-actions";
import { getCollectionById, ServiceError } from "@bloqer/services";
import { can, classifyAccountMovement } from "@bloqer/domain";
import { cancelCollectionAction } from "../actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";

interface PageProps {
  params: Promise<{ id: string; collectionId: string }>;
  searchParams: Promise<{ contabilidad?: string; actionError?: string }>;
}

export default async function CollectionDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, collectionId } = await params;
  const sp = await searchParams;
  const contabilidadErr = sp.contabilidad;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let collection;
  try {
    collection = await getCollectionById(collectionId, ctx, id);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const canEditAr = can(current.tenantCtx.roles, "EDIT", "AR");
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");
  const returnPath = `/proyectos/${id}/cobranzas/${collectionId}`;

  const collectionClass = classifyAccountMovement({
    type: "INFLOW",
    sourceType: "COLLECTION",
  });

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={formatDate(collection.collectionDate)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Cobranza</h1>
            <DocumentClassBadge
              classLabel={collectionClass.classLabel}
              classFamily={collectionClass.family}
            />
            <CollectionStatusBadge status={collection.status} />
          </div>
        </div>

        {canEditAr && collection.status === "CONFIRMED" && (
          <form
            action={async () => {
              "use server";
              const result = await cancelCollectionAction(collectionId, id);
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

      <ActionErrorBanner message={sp.actionError} />

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Detalle</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Fecha de cobro</dt>
            <dd className="font-medium">{formatDate(collection.collectionDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cuenta</dt>
            <dd className="font-medium">{collection.accountName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Moneda</dt>
            <dd className="font-medium">{collection.currency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Monto</dt>
            <dd className="font-bold font-mono">
              {formatMoneyAmount(collection.amount, collection.currency)}
            </dd>
          </div>
          {settlementMethodLabel(collection.paymentMethod) && (
            <div>
              <dt className="text-muted-foreground">Método</dt>
              <dd className="font-medium">{settlementMethodLabel(collection.paymentMethod)}</dd>
            </div>
          )}
          {collection.reference && (
            <div>
              <dt className="text-muted-foreground">Referencia</dt>
              <dd className="font-medium font-mono">{collection.reference}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Cuenta por cobrar</dt>
            <dd className="font-medium">
              <Link
                href={`/proyectos/${id}/cuentas-por-cobrar/${collection.receivableId}`}
                className="underline underline-offset-2"
              >
                Ver cuenta por cobrar
              </Link>
            </dd>
          </div>
          {collection.salesInvoiceId && (
            <div>
              <dt className="text-muted-foreground">Factura</dt>
              <dd className="font-medium">
                <Link
                  href={`/proyectos/${id}/facturas/${collection.salesInvoiceId}`}
                  className="underline underline-offset-2"
                >
                  Ver factura
                </Link>
              </dd>
            </div>
          )}
          {collection.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{collection.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {contabilidadErr && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {contabilidadErr}
        </p>
      )}

      {canEditAccounting && collection.status === "CONFIRMED" && (
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="font-semibold">Contabilidad</h2>
          <p className="text-sm text-muted-foreground">
            Generá un asiento en borrador según la regla activa para cobranzas confirmadas. La
            contabilización (posteo) se hace manualmente en Contabilidad.
          </p>
          <form action={generateJournalFromCollectionAction.bind(null, collectionId, returnPath)}>
            <Button type="submit" variant="outline">
              Generar asiento contable
            </Button>
          </form>
        </div>
      )}
    </PageShell>
  );
}
