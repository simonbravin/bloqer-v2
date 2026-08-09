import { notFound, redirect } from "next/navigation";
import {
  TreasuryAccountStatusBadge,
  AccountMovementList,
  DeactivateTreasuryAccountButton,
} from "@/features/treasury";
import type { AccountMovementListItem } from "@/features/treasury";
import { canEditTreasuryUi } from "@/features/treasury/lib/treasury-edit-gates";
import { getCurrentUser } from "@/lib/auth";
import { getTreasuryAccountById, listAccountMovements, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { reactivateTreasuryAccountAction } from "../../actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { Button } from "@/components/ui/button";
import { DataTableSection } from "@/components/ui/data-table-section";
import { formatMoneyAmount } from "@/lib/format-money";
import Link from "next/link";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  BANK: "Banco",
  CASH: "Caja",
  DIGITAL_WALLET: "Billetera",
  OTHER: "Otro",
};

export default async function AccountDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { accountId } = await params;
  const sp = await searchParams;
  const returnPath = `/tesoreria/cuentas/${accountId}`;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let account;
  let movements;
  try {
    account = await getTreasuryAccountById(accountId, ctx);
    movements = await listAccountMovements(accountId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  const canEdit = canEditTreasuryUi(ctx.roles);

  const movementItems: AccountMovementListItem[] = movements.map((m) => ({
    id: m.id,
    movementDate: m.movementDate,
    type: m.type,
    currency: m.currency,
    amount: m.amount,
    description: m.description,
    status: m.status,
  }));

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={account.name}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
          <TreasuryAccountStatusBadge status={account.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {account.status === "ACTIVE" && (
            <>
              {canEdit && (
                <Button asChild variant="default" size="sm">
                  <Link href={`/tesoreria/cuentas/${accountId}/ajuste`}>Ajuste manual</Link>
                </Button>
              )}
              {canEdit && <DeactivateTreasuryAccountButton accountId={accountId} />}
            </>
          )}
          {account.status === "INACTIVE" && canEdit && (
            <form
              action={async () => {
                "use server";
                const result = await reactivateTreasuryAccountAction(accountId);
                if ("error" in result) redirectWithActionError(returnPath, result.error);
                redirect(returnPath);
              }}
            >
              <Button variant="outline" size="sm">
                Reactivar
              </Button>
            </form>
          )}
        </div>
      </div>

      <ActionErrorBanner message={sp.actionError} />

      {!canEdit && account.status === "ACTIVE" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Tenés permiso de ver, no de editar.
        </p>
      ) : null}

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Detalle de cuenta</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-6 py-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd className="font-medium">{TYPE_LABELS[account.type] ?? account.type}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Moneda</dt>
            <dd className="font-medium">{account.currency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Saldo actual</dt>
            <dd className="font-bold font-mono">
              {formatMoneyAmount(account.balance, account.currency)}
            </dd>
          </div>
          {account.bankName && (
            <div>
              <dt className="text-muted-foreground">Banco</dt>
              <dd className="font-medium">{account.bankName}</dd>
            </div>
          )}
          {account.accountNumber && (
            <div>
              <dt className="text-muted-foreground">N° de cuenta</dt>
              <dd className="font-medium font-mono">{account.accountNumber}</dd>
            </div>
          )}
          {account.alias && (
            <div>
              <dt className="text-muted-foreground">Alias</dt>
              <dd className="font-medium">{account.alias}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Saldo inicial</dt>
            <dd className="font-medium font-mono">
              {formatMoneyAmount(account.openingBalance, account.currency)}
            </dd>
          </div>
          {account.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="whitespace-pre-wrap font-medium">{account.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <DataTableSection title="Movimientos">
        <AccountMovementList movements={movementItems} />
      </DataTableSection>
    </PageShell>
  );
}
