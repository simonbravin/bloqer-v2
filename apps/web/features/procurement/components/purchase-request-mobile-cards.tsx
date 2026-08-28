import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PurchaseRequestStatusBadge } from "./purchase-request-status-badge";
import type { PurchaseRequestView } from "@bloqer/services";
import type { ReactNode } from "react";
import { formatQtyFromString } from "@/lib/format-money";
import { purchaseRequestNeededByOverdueDays } from "../lib/purchase-delivery-overdue";

function primaryLine(pr: PurchaseRequestView) {
  return pr.lines[0] ?? null;
}

function wbsLabel(pr: PurchaseRequestView): string | null {
  const line = primaryLine(pr);
  if (!line?.wbsNodeCode) return null;
  return line.wbsNodeName ? `${line.wbsNodeCode} — ${line.wbsNodeName}` : line.wbsNodeCode;
}

export function PurchaseRequestMobileCards({
  requests,
  projectId,
  emptyAction,
}: {
  requests: PurchaseRequestView[];
  projectId: string;
  emptyAction?: ReactNode;
}) {
  if (requests.length === 0) {
    return (
      <ListEmptyState
        title="Sin solicitudes de compra"
        description="Creá una solicitud simple desde campo o desde Materiales."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {requests.map((pr) => {
        const href = `/proyectos/${projectId}/solicitudes-compra/${pr.id}`;
        const line = primaryLine(pr);
        const wbs = wbsLabel(pr);
        return (
          <article
            key={pr.id}
            className="rounded-lg border bg-card p-4 shadow-sm"
            data-testid="purchase-request-mobile-card"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-sm font-semibold">{pr.code}</p>
              <PurchaseRequestStatusBadge status={pr.status} />
            </div>
            {line ? (
              <p className="mt-2 line-clamp-2 text-sm">{line.description}</p>
            ) : null}
            {line && pr.lines.length === 1 ? (
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                {formatQtyFromString(line.quantity)} {line.unit}
              </p>
            ) : pr.lines.length > 1 ? (
              <p className="mt-1 text-sm text-muted-foreground">{pr.lines.length} líneas</p>
            ) : null}
            {wbs ? <p className="mt-1 text-sm text-muted-foreground">{wbs}</p> : null}
            <p className="mt-1 text-sm text-muted-foreground">
              {pr.requestedByName ?? "—"}
            </p>
            {pr.neededByDate ? (
              (() => {
                const overdue = purchaseRequestNeededByOverdueDays(pr.status, pr.neededByDate);
                return (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>Necesaria {formatDate(pr.neededByDate)}</span>
                    {overdue > 0 ? (
                      <Badge variant="destructive" className="whitespace-nowrap">
                        Vencida {overdue} d
                      </Badge>
                    ) : null}
                  </p>
                );
              })()
            ) : null}
            {pr.selectedSupplierName ? (
              <p className="mt-1 text-sm text-muted-foreground">{pr.selectedSupplierName}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(pr.createdAt)}</p>
            <Button asChild className="mt-3 min-h-11 w-full md:min-h-9">
              <Link href={href}>Ver solicitud</Link>
            </Button>
          </article>
        );
      })}
    </div>
  );
}
