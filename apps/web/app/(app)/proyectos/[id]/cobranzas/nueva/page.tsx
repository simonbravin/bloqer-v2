import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CollectionForm } from "@/features/collections";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import {
  listCollectibleReceivablesByProject,
  listTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receivableId?: string }>;
}

export default async function NuevaCobranzaPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const { receivableId: preSelectedId } = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let openReceivables;
  let allAccounts;
  try {
    const [receivablesResult, accountsResult] = await Promise.all([
      listCollectibleReceivablesByProject(id, ctx),
      listTreasuryAccounts(ctx),
    ]);
    openReceivables = receivablesResult;
    allAccounts = accountsResult.data;
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const activeAccounts = allAccounts
    .filter(
      (a) =>
        a.status === "ACTIVE" && (!ctx.companyId || !a.companyId || a.companyId === ctx.companyId),
    )
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  const selected = preSelectedId
    ? (openReceivables.find((r) => r.id === preSelectedId) ?? openReceivables[0])
    : openReceivables[0];

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva cobranza</h1>
      </div>

      {openReceivables.length === 0 ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No hay cuentas por cobrar pendientes en este proyecto.{" "}
            <Link
              href={`/proyectos/${id}/cuentas-por-cobrar`}
              className="underline underline-offset-2"
            >
              Ver cuentas por cobrar
            </Link>
          </p>
        </div>
      ) : (
        <>
          {openReceivables.length > 1 && (
            <div className="rounded-lg border bg-card px-6 py-4">
              <p className="mb-2 text-sm font-medium">Seleccionar cuenta por cobrar</p>
              <div className="flex flex-wrap gap-2">
                {openReceivables.map((r) => (
                  <Button
                    key={r.id}
                    variant={selected?.id === r.id ? "default" : "outline"}
                    size="sm"
                    asChild
                  >
                    <Link href={`/proyectos/${id}/cobranzas/nueva?receivableId=${r.id}`}>
                      {r.currency} {r.balanceDue} — {r.clientName}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <CollectionForm
              projectId={id}
              receivableId={selected.id}
              receivableBalance={selected.balanceDue}
              receivableCurrency={selected.currency}
              accounts={activeAccounts}
            />
          )}
        </>
      )}
    </PageShell>
  );
}
