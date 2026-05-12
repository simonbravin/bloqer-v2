import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TreasuryAccountStatusBadge } from "./treasury-account-status-badge";
import type { TreasuryAccountType, TreasuryAccountStatus } from "@bloqer/database";

export type TreasuryAccountListItem = {
  id: string;
  name: string;
  type: TreasuryAccountType;
  currency: string;
  balance: string;
  status: TreasuryAccountStatus;
  bankName: string | null;
};

const TYPE_LABELS: Record<TreasuryAccountType, string> = {
  BANK:           "Banco",
  CASH:           "Caja",
  DIGITAL_WALLET: "Billetera",
  OTHER:          "Otro",
};

function fmtMoney(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

interface TreasuryAccountListProps {
  accounts: TreasuryAccountListItem[];
}

export function TreasuryAccountList({ accounts }: TreasuryAccountListProps) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin cuentas. Cree la primera cuenta de tesorería.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Moneda</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((acc) => (
          <TableRow key={acc.id}>
            <TableCell className="font-medium">{acc.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{TYPE_LABELS[acc.type]}</TableCell>
            <TableCell className="text-sm">{acc.currency}</TableCell>
            <TableCell className="text-right font-mono text-sm">
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
  );
}
