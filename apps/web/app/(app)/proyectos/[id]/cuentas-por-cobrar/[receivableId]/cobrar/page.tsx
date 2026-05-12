import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CollectionForm } from "@/features/collections";
import { getCurrentUser } from "@/lib/auth";
import {
  getReceivableById,
  listTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string; receivableId: string }>;
}

export default async function CobrarReceivablePage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, receivableId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let receivable;
  let allAccounts;
  try {
    [receivable, allAccounts] = await Promise.all([
      getReceivableById(receivableId, ctx),
      listTreasuryAccounts(ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const activeAccounts = allAccounts
    .filter((a) => a.status === "ACTIVE")
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  const isBlocked = receivable.status === "PAID" || receivable.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/cuentas-por-cobrar/${receivableId}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Registrar cobro</h1>
      </div>

      {isBlocked ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Esta cuenta por cobrar está en estado{" "}
            <strong>
              {receivable.status === "PAID" ? "cobrada" : "cancelada"}
            </strong>{" "}
            y no admite nuevos cobros.{" "}
            <Link
              href={`/proyectos/${id}/cuentas-por-cobrar/${receivableId}`}
              className="underline underline-offset-2"
            >
              Ver detalle
            </Link>
          </p>
        </div>
      ) : (
        <CollectionForm
          projectId={id}
          receivableId={receivableId}
          receivableBalance={receivable.balanceDue}
          receivableCurrency={receivable.currency}
          accounts={activeAccounts}
        />
      )}
    </div>
  );
}
