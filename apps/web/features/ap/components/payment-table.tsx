import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { PaymentListItem } from "./payment-list";

export function PaymentTable({
  payments,
  hrefPrefix,
}: {
  payments: PaymentListItem[];
  hrefPrefix: string;
}) {
  if (payments.length === 0) {
    return <ListEmptyState message="No hay pagos registrados." />;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Cuenta</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="text-sm">{formatDate(p.paymentDate)}</TableCell>
              <TableCell className="text-sm">{p.accountName}</TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {Number(p.amount).toLocaleString("es-AR", {
                  style: "currency",
                  currency: p.currency,
                })}
              </TableCell>
              <TableCell>
                <Badge variant={p.status === "CANCELLED" ? "destructive" : "default"}>
                  {p.status === "CANCELLED" ? "Cancelado" : "Confirmado"}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`${hrefPrefix}/${p.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
