import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { PaymentListItem } from "./payment-list";

export function PaymentCards({
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {payments.map((p) => (
        <Link
          key={p.id}
          href={`${hrefPrefix}/${p.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(p.paymentDate)}</span>
            <Badge variant={p.status === "CANCELLED" ? "destructive" : "default"}>
              {p.status === "CANCELLED" ? "Cancelado" : "Confirmado"}
            </Badge>
          </div>
          <h3 className="mt-2 font-semibold leading-snug">{p.accountName}</h3>
          <div className="mt-3 flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">Monto</span>
            <span className="font-medium">
              {Number(p.amount).toLocaleString("es-AR", {
                style: "currency",
                currency: p.currency,
              })}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
