"use client";
import { formatDate, formatDateTime } from "@/lib/format";

import Link from "next/link";
import { PayableStatusBadge } from "./payable-status-badge";

export type PayableListItem = {
  id: string;
  supplierName: string;
  dueDate: Date;
  status: string;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
  /** Corporate list: link label to supplier invoice detail. */
  supplierInvoiceId?: string;
  supplierInvoiceCode?: string | null;
};

interface Props {
  payables: PayableListItem[];
  /** e.g. `/proyectos/x/cuentas-por-pagar` or `/finanzas/cuentas-por-pagar` */
  hrefPrefix: string;
  /** When set with `supplierInvoiceId` / `supplierInvoiceCode`, links the factura label. */
  supplierInvoiceHrefPrefix?: string;
}

export function PayableList({ payables, hrefPrefix, supplierInvoiceHrefPrefix }: Props) {
  if (payables.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay cuentas por pagar registradas.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {payables.map((p) => (
        <div key={p.id} className="flex items-center justify-between px-2 py-3 hover:bg-muted/40">
          <div className="flex flex-col gap-0.5">
            <Link
              href={`${hrefPrefix}/${p.id}`}
              className="text-sm font-medium hover:underline"
            >
              {p.supplierName}
            </Link>
            <span className="text-xs text-muted-foreground">
              Vence {formatDate(p.dueDate)}
              {p.supplierInvoiceCode && p.supplierInvoiceId && supplierInvoiceHrefPrefix ? (
                <>
                  {" · "}
                  <Link
                    href={`${supplierInvoiceHrefPrefix}/${p.supplierInvoiceId}`}
                    className="hover:underline"
                  >
                    {p.supplierInvoiceCode}
                  </Link>
                </>
              ) : null}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-muted-foreground">Saldo</div>
              <div className="text-sm font-medium tabular-nums">
                {Number(p.balanceDue).toLocaleString("es-AR", { style: "currency", currency: p.currency })}
              </div>
            </div>
            <PayableStatusBadge status={p.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
