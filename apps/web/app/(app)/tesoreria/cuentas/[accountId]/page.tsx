import { notFound, redirect } from "next/navigation";
import { TreasuryAccountStatusBadge, AccountMovementList } from "@/features/treasury";
import type { AccountMovementListItem } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { getTreasuryAccountById, listAccountMovements, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { deactivateTreasuryAccountAction, reactivateTreasuryAccountAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { DataTableSection } from "@/components/ui/data-table-section";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  BANK: "Banco",
  CASH: "Caja",
  DIGITAL_WALLET: "Billetera",
  OTHER: "Otro",
};

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

export default async function AccountDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { accountId } = await params;
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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const doDeactivate = async () => {
    "use server";
    await deactivateTreasuryAccountAction(accountId);
  };

  const doReactivate = async () => {
    "use server";
    await reactivateTreasuryAccountAction(accountId);
  };

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
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href="/tesoreria/cuentas" label="Volver" />
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
            <TreasuryAccountStatusBadge status={account.status} />
          </div>
        </div>

        {account.status === "ACTIVE" && (
          <form action={doDeactivate}>
            <Button variant="outline" size="sm" className="text-muted-foreground">
              Desactivar
            </Button>
          </form>
        )}
        {account.status === "INACTIVE" && (
          <form action={doReactivate}>
            <Button variant="outline" size="sm">
              Reactivar
            </Button>
          </form>
        )}
      </div>

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
            <dd className="font-bold font-mono">{fmtMoney(account.balance, account.currency)}</dd>
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
              {fmtMoney(account.openingBalance, account.currency)}
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
