import { formatDate, formatDateTime } from "@/lib/format";
import type { PaymentDetail } from "@bloqer/services";

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return formatDate(d );
}

interface Props {
  payments: PaymentDetail[];
  currency: string;
}

export function PaymentDetailTable({ payments, currency }: Props) {
  if (payments.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin pagos confirmados en el período seleccionado.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
            <th className="px-4 py-2.5 text-left font-medium">Proveedor</th>
            <th className="px-4 py-2.5 text-left font-medium">Factura</th>
            <th className="px-4 py-2.5 text-left font-medium">Cuenta</th>
            <th className="px-4 py-2.5 text-right font-medium">Monto ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.paymentId} className="border-t">
              <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(p.date)}</td>
              <td className="px-4 py-2.5 font-medium">{p.supplierName}</td>
              <td className="px-4 py-2.5 text-muted-foreground">#{p.supplierInvoiceNumber}</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.accountName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono text-red-600 dark:text-red-400">
                {fmt(p.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
