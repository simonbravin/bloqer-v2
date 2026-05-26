"use client";
import { formatDate, formatDateTime } from "@/lib/format";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export type PaymentListItem = {
  id: string;
  paymentDate: Date;
  amount: string;
  currency: string;
  status: string;
  accountName: string;
  supplierInvoiceId: string;
};

interface Props {
  payments: PaymentListItem[];
  /** e.g. `/proyectos/x/pagos` or `/finanzas/pagos-proveedor` */
  hrefPrefix: string;
}

export function PaymentList({ payments, hrefPrefix }: Props) {
  if (payments.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay pagos registrados.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between px-2 py-3 hover:bg-muted/40">
          <div className="flex flex-col gap-0.5">
            <Link
              href={`${hrefPrefix}/${p.id}`}
              className="text-sm font-medium hover:underline"
            >
              {formatDate(p.paymentDate)}
            </Link>
            <span className="text-xs text-muted-foreground">{p.accountName}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium tabular-nums">
              {Number(p.amount).toLocaleString("es-AR", { style: "currency", currency: p.currency })}
            </span>
            <Badge variant={p.status === "CANCELLED" ? "destructive" : "default"}>
              {p.status === "CANCELLED" ? "Cancelado" : "Confirmado"}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
