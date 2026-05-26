import { formatDate, formatDateTime } from "@/lib/format";
import type { CollectionDetail } from "@bloqer/services";

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return formatDate(d );
}

interface Props {
  collections: CollectionDetail[];
  currency:    string;
}

export function CollectionDetailTable({ collections, currency }: Props) {
  if (collections.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin cobranzas confirmadas en el período seleccionado.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
            <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
            <th className="px-4 py-2.5 text-left font-medium">Factura</th>
            <th className="px-4 py-2.5 text-left font-medium">Cuenta</th>
            <th className="px-4 py-2.5 text-right font-medium">Monto ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {collections.map((c) => (
            <tr key={c.collectionId} className="border-t">
              <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(c.date)}</td>
              <td className="px-4 py-2.5 font-medium">{c.clientName}</td>
              <td className="px-4 py-2.5 text-muted-foreground">#{c.invoiceNumber}</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">{c.accountName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                {fmt(c.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
