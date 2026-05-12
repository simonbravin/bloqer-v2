"use client";

import Link from "next/link";
import { SupplierInvoiceStatusBadge } from "./supplier-invoice-status-badge";

export type SupplierInvoiceListItem = {
  id: string;
  projectId: string;
  code: string;
  supplierName: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: string;
  currency: string;
  status: string;
};

interface Props {
  invoices: SupplierInvoiceListItem[];
  projectId: string;
}

export function SupplierInvoiceList({ invoices, projectId }: Props) {
  if (invoices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay facturas de proveedor registradas.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {invoices.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between px-2 py-3 hover:bg-muted/40">
          <div className="flex flex-col gap-0.5">
            <Link
              href={`/proyectos/${projectId}/facturas-proveedor/${inv.id}`}
              className="text-sm font-medium hover:underline"
            >
              {inv.code}
            </Link>
            <span className="text-xs text-muted-foreground">{inv.supplierName}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              Vence {new Date(inv.dueDate).toLocaleDateString("es-AR")}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {Number(inv.totalAmount).toLocaleString("es-AR", { style: "currency", currency: inv.currency })}
            </span>
            <SupplierInvoiceStatusBadge status={inv.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
