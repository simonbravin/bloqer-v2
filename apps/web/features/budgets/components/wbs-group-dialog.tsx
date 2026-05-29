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
import { canAddChild } from "../lib/wbs-codes";
import { isWbsStructuralLeaf } from "../lib/wbs-apu";

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

  if (!node || isWbsStructuralLeaf(node)) return null;

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
          <p className="text-sm text-muted-foreground pt-1">
            Capítulo (agrupa el subárbol). El APU va en cada ítem hoja de esta rama.
          </p>
        </DialogHeader>

        {editable && canAddChild(node) && (
          <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">¿Dónde está el APU?</p>
            <p className="mt-1">
              Usá <strong>+</strong> para agregar el siguiente nivel (ej. {node.code}.1). El APU se
              edita haciendo clic en la fila más baja de cada rama.
            </p>
          </div>
        )}

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
