import { notFound, redirect } from "next/navigation";
import {
  TreasuryAccountStatusBadge,
  TreasuryAccountStatusButton,
} from "@/features/treasury";
import {
  canEditInternalTransfersUi,
  canEditTreasuryUi,
} from "@/features/treasury/lib/treasury-edit-gates";
import { MovementLedgerTable } from "@/features/treasury-reports";
import { ReportExportActions } from "@/features/reports";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  getAccountMovementReport,
  getTreasuryAccountById,
  getTenantModuleGate,
  listTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { reactivateTreasuryAccountAction } from "../../actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { Button } from "@/components/ui/button";
import { DataTableSection } from "@/components/ui/data-table-section";
import { formatMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";
import Link from "next/link";

interface PageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ actionError?: string; contabilidad?: string; sort?: string; dir?: string; dateBasis?: string }>;
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
  try {
    account = await getTreasuryAccountById(accountId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  const canEdit = canEditTreasuryUi(ctx.roles);
  const canShowClose = canEdit && account.status !== "CLOSED";
  const hasZeroBalance = isZeroMoneyAmount(account.balance);
  const canTransfer = canEditInternalTransfersUi(ctx.roles);
  const gate = await getTenantModuleGate(ctx);
  const canEditAccounting = gate.isEnabled("ACCOUNTING") && can(ctx.roles, "EDIT", "ACCOUNTING");
  const canViewReconciliation = gate.isEnabled("BANK_RECONCILIATION") && can(ctx.roles, "VIEW", "BANK_RECONCILIATION");
  const sortDir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined;
  const dateBasis = sp.dateBasis === "value" ? "value" : "accounting";
  const extractHref = (basis: "accounting" | "value") => {
    const query = new URLSearchParams();
    if (basis === "value") query.set("dateBasis", basis);
    if (sortDir) query.set("dir", sortDir);
    return query.size > 0 ? `${returnPath}?${query}` : returnPath;
  };

  let canTransferFromThisAccount = false;
  if (canTransfer && account.status === "ACTIVE") {
    try {
      const { data: peers } = await listTreasuryAccounts(ctx);
      canTransferFromThisAccount = peers.some(
        (a) =>
          a.id !== accountId &&
          a.status === "ACTIVE" &&
          a.currency === account.currency,
      );
    } catch {
      canTransferFromThisAccount = false;
    }
  }

  let movementRows;
  try {
    ({ rows: movementRows } = await getAccountMovementReport(
      { accountId, sortDir, dateBasis },
      ctx,
    ));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/tesoreria");
    throw err;
  }

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
              {canTransferFromThisAccount && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/tesoreria/transferencias/nueva?fromAccountId=${encodeURIComponent(accountId)}`}
                  >
                    Transferir entre cuentas
                  </Link>
                </Button>
              )}
              {canEdit && (
                <Button asChild variant="default" size="sm">
                  <Link href={`/tesoreria/cuentas/${accountId}/ajuste`}>Ajuste manual</Link>
                </Button>
              )}
              {canViewReconciliation && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/tesoreria/conciliacion?cuenta=${encodeURIComponent(accountId)}`}
                  >
                    Conciliar
                  </Link>
                </Button>
              )}
              {canEdit && <TreasuryAccountStatusButton accountId={accountId} operation="deactivate" />}
            </>
          )}
          {canShowClose ? <TreasuryAccountStatusButton accountId={accountId} operation="close" disabled={!hasZeroBalance} /> : null}
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

      <ActionErrorBanner message={sp.actionError ?? sp.contabilidad} />
      {canShowClose && !hasZeroBalance ? <p className="text-sm text-muted-foreground">Para cerrar la cuenta, el saldo debe ser cero.</p> : null}

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

      <DataTableSection
        title="Extracto"
        actions={
          <ReportExportActions
            exportPath="/api/reports/tesoreria/movimientos.csv"
            params={{ accountId, dir: sortDir, dateBasis }}
            pdf
          />
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Criterio de fecha del extracto">
          <Button asChild size="sm" variant={dateBasis === "accounting" ? "secondary" : "outline"}>
            <Link href={extractHref("accounting")} aria-current={dateBasis === "accounting" ? "true" : undefined}>Fecha contable</Link>
          </Button>
          <Button asChild size="sm" variant={dateBasis === "value" ? "secondary" : "outline"}>
            <Link href={extractHref("value")} aria-current={dateBasis === "value" ? "true" : undefined}>Fecha valor</Link>
          </Button>
        </div>
        {dateBasis === "value" ? (
          <p className="mb-3 text-xs text-muted-foreground">Si la fecha valor no se registró, se usa la fecha contable para ordenar y calcular el saldo.</p>
        ) : null}
        <div className="text-sm text-muted-foreground mb-3">
          {movementRows.length} movimiento{movementRows.length === 1 ? "" : "s"}.
        </div>
        <MovementLedgerTable
          rows={movementRows}
          showRunningBalance
          dateBasis={dateBasis}
          showAccountColumn={false}
          accountingReturnPath={extractHref(dateBasis)}
          canEditAccounting={canEditAccounting}
        />
      </DataTableSection>
    </PageShell>
  );
}
