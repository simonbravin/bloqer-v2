import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TreasuryAccountStatusBadge } from "./treasury-account-status-badge";
import type { TreasuryAccountListItem } from "./treasury-account-list";
import type { TreasuryAccountType } from "@bloqer/database";
import { formatMoneyAmount } from "@/lib/format-money";

const TYPE_LABELS: Record<TreasuryAccountType, string> = {
  BANK: "Banco",
  CASH: "Caja",
  DIGITAL_WALLET: "Billetera",
  OTHER: "Otro",
};

export function TreasuryAccountCards({ accounts }: { accounts: TreasuryAccountListItem[] }) {
  if (accounts.length === 0) {
    return <ListEmptyState message="Sin cuentas. Cree la primera cuenta de tesorería." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((acc) => (
        <Link
          key={acc.id}
          href={`/tesoreria/cuentas/${acc.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">{TYPE_LABELS[acc.type]}</span>
            <TreasuryAccountStatusBadge status={acc.status} />
          </div>
          <h3 className="mt-2 font-semibold leading-snug">{acc.name}</h3>
          {acc.bankName ? (
            <p className="mt-1 text-sm text-muted-foreground">{acc.bankName}</p>
          ) : null}
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Saldo</span>
            <span className="font-medium">
              {formatMoneyAmount(acc.balance)} {acc.currency}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
