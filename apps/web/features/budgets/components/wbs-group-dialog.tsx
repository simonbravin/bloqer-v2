"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoneyAmount } from "@/lib/format-money";
import { WbsNodeForm } from "./wbs-node-form";
import type { WbsViewNode } from "@bloqer/services";
import type { UpdateWbsNodeInput } from "@bloqer/validators";
import { computeWbsRowMetrics } from "../lib/wbs-metrics";

interface WbsGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: WbsViewNode | null;
  currency: string;
  editable: boolean;
  onUpdateNode: (nodeId: string, data: UpdateWbsNodeInput) => Promise<{ ok: true } | { error: string }>;
}

export function WbsGroupDialog({
  open,
  onOpenChange,
  node,
  currency,
  editable,
  onUpdateNode,
}: WbsGroupDialogProps) {
  const router = useRouter();

  if (!node || node.type !== "GROUP") return null;

  const metrics = computeWbsRowMetrics(node);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <span className="font-mono text-muted-foreground">{node.code}</span>
            {" — "}
            {node.name}
          </DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Costo directo (subárbol)</dt>
            <dd className="font-mono font-medium">
              {formatMoneyAmount(String(metrics.totalCostDirect), currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Venta (subárbol)</dt>
            <dd className="font-mono font-semibold">
              {formatMoneyAmount(String(metrics.totalSalePrice), currency)}
            </dd>
          </div>
        </dl>

        {editable ? (
          <WbsNodeForm
            mode="edit"
            defaults={{
              code: node.code,
              name: node.name,
              description: node.description,
            }}
            onSubmit={async (data) => {
              const result = await onUpdateNode(node.id, data);
              if (!("error" in result)) router.refresh();
              return result;
            }}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Este capítulo no admite edición en el estado actual.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
