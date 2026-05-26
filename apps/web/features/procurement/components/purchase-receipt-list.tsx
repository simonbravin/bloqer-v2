"use client";
import { formatDate, formatDateTime } from "@/lib/format";

import Link from "next/link";
import { PurchaseReceiptStatusBadge } from "./purchase-receipt-status-badge";

export type PurchaseReceiptListItem = {
  id: string;
  purchaseOrderCode: string;
  supplierName: string;
  receiptDate: Date;
  status: string;
};

interface Props {
  receipts: PurchaseReceiptListItem[];
  projectId: string;
}

export function PurchaseReceiptList({ receipts, projectId }: Props) {
  if (receipts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay recepciones registradas.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {receipts.map((r) => (
        <div key={r.id} className="flex items-center justify-between px-2 py-3 hover:bg-muted/40">
          <div className="flex flex-col gap-0.5">
            <Link
              href={`/proyectos/${projectId}/recepciones/${r.id}`}
              className="text-sm font-medium hover:underline"
            >
              Recepción — {r.purchaseOrderCode}
            </Link>
            <span className="text-xs text-muted-foreground">{r.supplierName}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {formatDate(r.receiptDate)}
            </span>
            <PurchaseReceiptStatusBadge status={r.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
