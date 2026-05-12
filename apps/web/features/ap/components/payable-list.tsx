"use client";

import Link from "next/link";
import { PayableStatusBadge } from "./payable-status-badge";

export type PayableListItem = {
  id: string;
  projectId: string;
  supplierName: string;
  dueDate: Date;
  status: string;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
};

interface Props {
  payables: PayableListItem[];
  projectId: string;
}

export function PayableList({ payables, projectId }: Props) {
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
              href={`/proyectos/${projectId}/cuentas-por-pagar/${p.id}`}
              className="text-sm font-medium hover:underline"
            >
              {p.supplierName}
            </Link>
            <span className="text-xs text-muted-foreground">
              Vence {new Date(p.dueDate).toLocaleDateString("es-AR")}
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
