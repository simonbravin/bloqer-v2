import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TreasuryAccountStatusBadge } from "./treasury-account-status-badge";
import type { TreasuryAccountListItem } from "./treasury-account-list";
import type { TreasuryAccountType } from "@bloqer/database";

const TYPE_LABELS: Record<TreasuryAccountType, string> = {
  BANK: "Banco",
  CASH: "Caja",
  DIGITAL_WALLET: "Billetera",
  OTHER: "Otro",
};

function fmtMoney(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

export function TreasuryAccountTable({ accounts }: { accounts: TreasuryAccountListItem[] }) {
  if (accounts.length === 0) {
    return <ListEmptyState message="Sin cuentas. Cree la primera cuenta de tesorería." />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((acc) => (
            <TableRow key={acc.id}>
              <TableCell className="font-medium">{acc.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{TYPE_LABELS[acc.type]}</TableCell>
              <TableCell className="text-sm">{acc.currency}</TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {fmtMoney(acc.balance)} {acc.currency}
              </TableCell>
              <TableCell>
                <TreasuryAccountStatusBadge status={acc.status} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/tesoreria/cuentas/${acc.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
