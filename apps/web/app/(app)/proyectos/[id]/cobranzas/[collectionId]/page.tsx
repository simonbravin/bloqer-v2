import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CollectionStatusBadge } from "@/features/collections";
import { getCurrentUser } from "@/lib/auth";
import { generateJournalFromCollectionAction } from "@/app/(app)/contabilidad/source-draft-actions";
import { getCollectionById, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { cancelCollectionAction } from "../actions";
import { formatDate } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string; collectionId: string }>;
  searchParams: Promise<{ contabilidad?: string }>;
}

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parseFloat(value)) +
    " " +
    currency
  );
}

export default async function CollectionDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, collectionId } = await params;
  const sp = await searchParams;
  const contabilidadErr = sp.contabilidad;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let collection;
  try {
    collection = await getCollectionById(collectionId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const doCancel = async () => {
    "use server";
    await cancelCollectionAction(collectionId, id);
  };

  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");
  const returnPath = `/proyectos/${id}/cobranzas/${collectionId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}/cobranzas`}>← Volver</Link>
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Cobranza</h1>
            <CollectionStatusBadge status={collection.status} />
          </div>
        </div>

        {collection.status === "CONFIRMED" && (
          <form action={doCancel}>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Cancelar
            </Button>
          </form>
        )}
      </div>

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
              {fmtMoney(collection.amount, collection.currency)}
            </dd>
          </div>
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
            Generá un asiento en borrador según la regla activa para cobranzas confirmadas. La contabilización (posteo) se hace manualmente en Contabilidad.
          </p>
          <form action={generateJournalFromCollectionAction.bind(null, collectionId, returnPath)}>
            <Button type="submit" variant="outline">
              Generar asiento contable
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
