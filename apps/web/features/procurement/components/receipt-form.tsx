"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import {
  createPurchaseReceiptAction,
  updatePurchaseReceiptAction,
  confirmPurchaseReceiptAction,
  cancelPurchaseReceiptAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import type { PurchaseOrderLineView } from "@bloqer/services";
import { DecimalInput } from "@/components/ui/decimal-input";
import { formatQtyFromString, isPositiveQty, compareQty } from "@/lib/format-money";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { procurementActionBtnClass } from "@/features/procurement/lib/procurement-ui";
import { useProcurementAction } from "../lib/use-procurement-action";

function todayLocalInputDate(): string {
  return toIsoDateInTimeZone();
}

export type WarehouseOption = { id: string; name: string };

interface ReceiptLine {
  purchaseOrderLineId: string;
  description: string;
  unit: string;
  ordered: string;
  previouslyReceived: string;
  remaining: string;
  quantityReceived: string;
}

type CreateProps = {
  mode?: "create";
  projectId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  poLines: PurchaseOrderLineView[];
  warehouseOptions?: WarehouseOption[];
  extraSections?: ReactNode;
  onCreated?: (id: string) => Promise<{ navigate?: boolean; message?: string } | void>;
};

type EditProps = {
  mode: "edit";
  projectId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  receiptId: string;
  poLines: PurchaseOrderLineView[];
  warehouseOptions?: WarehouseOption[];
  initialReceiptDate: string;
  initialNotes: string | null;
  initialWarehouseId: string | null;
  /** Prefill qty by purchaseOrderLineId (from the DRAFT receipt). */
  initialQuantities: Record<string, string>;
  extraSections?: ReactNode;
};

export type ReceiptFormProps = CreateProps | EditProps;

function ReceiptQtyInput({
  line,
  index,
  onChange,
}: {
  line: ReceiptLine;
  index: number;
  onChange: (index: number, value: string) => void;
}) {
  const inputId = `receipt-qty-${line.purchaseOrderLineId}`;
  return (
    <div className="space-y-1 md:space-y-0">
      <Label htmlFor={inputId} className="text-sm font-semibold md:sr-only">
        Cantidad recibida
      </Label>
      <DecimalInput
        id={inputId}
        value={line.quantityReceived}
        onValueChange={(v) => onChange(index, v)}
        precision={4}
        placeholder="0,00"
        className="h-11 min-h-11 text-base tabular-nums md:h-8 md:min-h-8 md:text-sm"
        aria-label={`Cantidad recibida de ${line.description}`}
      />
    </div>
  );
}

function buildLines(
  poLines: PurchaseOrderLineView[],
  initialQuantities?: Record<string, string>,
): ReceiptLine[] {
  return poLines
    .filter((l) => {
      if (isPositiveQty(l.remainingQuantity)) return true;
      // Keep lines already on the draft even if remaining was mis-synced.
      return Boolean(initialQuantities?.[l.id] && isPositiveQty(initialQuantities[l.id]!));
    })
    .map((l) => {
      const prefill = initialQuantities?.[l.id];
      return {
        purchaseOrderLineId: l.id,
        description: l.description,
        unit: l.unit,
        ordered: l.quantity,
        previouslyReceived: l.receivedQuantity,
        remaining: l.remainingQuantity,
        quantityReceived: prefill && isPositiveQty(prefill) ? prefill : l.remainingQuantity,
      };
    });
}

type PendingAction = "save" | "confirm" | "cancel" | null;

const receiptRowColumns = "md:grid-cols-[minmax(0,4fr)_minmax(0,3.2fr)_minmax(0,2.8fr)] md:gap-x-3 md:px-3";
const receiptDetailColumns = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] md:gap-x-3";

export function ReceiptForm(props: ReceiptFormProps) {
  const isEdit = props.mode === "edit";
  const {
    projectId,
    purchaseOrderId,
    purchaseOrderCode,
    poLines,
    warehouseOptions = [],
    extraSections,
  } = props;

  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { pending: isPending, run: startTransition, isRunning } = useProcurementAction();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string>(
    isEdit && props.initialWarehouseId ? props.initialWarehouseId : "__none__",
  );
  const { idempotencyKey, rotateIdempotencyKey } = useIdempotencyKey();
  const actionBtn = procurementActionBtnClass;

  const [lines, setLines] = useState<ReceiptLine[]>(() =>
    buildLines(poLines, isEdit ? props.initialQuantities : undefined),
  );

  function updateQty(i: number, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, quantityReceived: value } : l)));
  }

  function validateActiveLines(): ReceiptLine[] | null {
    const activeLines = lines.filter((l) => isPositiveQty(l.quantityReceived));
    if (lines.some((line) => line.quantityReceived.trim() && compareQty(line.quantityReceived, "0") < 0)) {
      setError("Las cantidades recibidas no pueden ser negativas");
      return null;
    }
    if (activeLines.length === 0) {
      setError("Debe ingresar al menos una cantidad mayor a cero");
      return null;
    }
    // The service applies the company's tolerance against the current OC quantities.
    return activeLines;
  }

  function readHeader(form: HTMLFormElement) {
    const fd = new FormData(form);
    return {
      receiptDate: fd.get("receiptDate") as string,
      notes: ((fd.get("notes") as string) || null) as string | null,
      warehouseId: warehouseId === "__none__" ? null : warehouseId,
    };
  }

  function payloadLines(activeLines: ReceiptLine[]) {
    return activeLines.map((l) => ({
      purchaseOrderLineId: l.purchaseOrderLineId,
      quantityReceived: l.quantityReceived,
      notes: null as string | null,
    }));
  }

  function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isRunning()) return;
    setError(null);
    const activeLines = validateActiveLines();
    if (!activeLines) return;
    const header = readHeader(e.currentTarget);
    const onCreated = props.mode === "create" ? props.onCreated : undefined;

    setPendingAction("save");
    startTransition(async () => {
      try {
        const res = await createPurchaseReceiptAction(projectId, {
          purchaseOrderId,
          warehouseId: header.warehouseId,
          receiptDate: header.receiptDate,
          notes: header.notes,
          idempotencyKey,
          lines: payloadLines(activeLines),
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        rotateIdempotencyKey();
        let created: { navigate?: boolean; message?: string } | void = undefined;
        try {
          created = await onCreated?.(res.id);
        } catch {
          created = {
            navigate: false,
            message: "Recepción creada correctamente. Algún archivo no pudo subirse.",
          };
        }
        if (created?.message) toast.warning(created.message);
        if (created?.navigate === false) return;
        router.push(`/proyectos/${projectId}/recepciones/${res.id}`);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleSaveDraft(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isRunning()) return;
    if (!isEdit) return;
    setError(null);
    const activeLines = validateActiveLines();
    if (!activeLines) return;
    const header = readHeader(e.currentTarget);
    const { receiptId } = props;

    setPendingAction("save");
    startTransition(async () => {
      try {
        const res = await updatePurchaseReceiptAction(receiptId, projectId, purchaseOrderId, {
          warehouseId: header.warehouseId,
          receiptDate: header.receiptDate,
          notes: header.notes,
          lines: payloadLines(activeLines),
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        toast.success("Borrador actualizado");
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleConfirm() {
    if (isRunning()) return;
    if (!isEdit) return;
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    setError(null);
    const activeLines = validateActiveLines();
    if (!activeLines) return;
    const header = readHeader(form);
    const { receiptId } = props;

    setPendingAction("confirm");
    startTransition(async () => {
      try {
        const saved = await updatePurchaseReceiptAction(receiptId, projectId, purchaseOrderId, {
          warehouseId: header.warehouseId,
          receiptDate: header.receiptDate,
          notes: header.notes,
          lines: payloadLines(activeLines),
        });
        if ("error" in saved) {
          setError(saved.error);
          return;
        }
        const confirmed = await confirmPurchaseReceiptAction(receiptId, projectId, purchaseOrderId);
        if ("error" in confirmed) {
          setError(confirmed.error);
          return;
        }
        if (confirmed.autoDraftApWarning) {
          toast.warning(confirmed.autoDraftApWarning);
        } else {
          toast.success("Recepción confirmada");
        }
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleAnular() {
    if (isRunning()) return;
    if (!isEdit) return;
    const { receiptId } = props;
    setError(null);
    setPendingAction("cancel");
    startTransition(async () => {
      try {
        const res = await cancelPurchaseReceiptAction(receiptId, projectId, purchaseOrderId);
        if ("error" in res) {
          setError(res.error);
          return;
        }
        toast.success("Recepción anulada");
        setCancelOpen(false);
        router.push(`/proyectos/${projectId}/ordenes-compra/${purchaseOrderId}`);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No hay cantidades pendientes de recepcionar en esta orden de compra.
        </p>
      </div>
    );
  }

  const defaultDate = isEdit ? props.initialReceiptDate : todayLocalInputDate();
  const defaultNotes = isEdit ? (props.initialNotes ?? "") : "";

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <p className="text-sm text-muted-foreground mb-4">OC: {purchaseOrderCode}</p>
      <form
        ref={formRef}
        onSubmit={isEdit ? handleSaveDraft : handleCreateSubmit}
        className="space-y-5"
      >
<fieldset disabled={isPending} className="min-w-0 space-y-5">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {warehouseOptions.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="receipt-warehouse">Depósito destino</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger id="receipt-warehouse">
                <SelectValue placeholder="Seleccionar depósito" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin depósito</SelectItem>
                {warehouseOptions.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Las líneas sin producto asociado no generan stock. Para recibir productos de inventario necesitás un depósito autorizado; si no aparece ninguno, revisá Inventario o pedí acceso.
        </p>

        <div className="space-y-1">
          <Label htmlFor="receiptDate">Fecha de recepción</Label>
          <Input
            id="receiptDate"
            name="receiptDate"
            type="date"
            required
            defaultValue={defaultDate}
            key={`date-${defaultDate}`}
          />
        </div>

        <div className="md:rounded-lg md:border md:bg-card">
          <div aria-hidden className={`hidden border-b py-3 text-sm font-medium text-muted-foreground md:grid ${receiptRowColumns}`}>
            <span>Descripción</span>
            <div className={`grid ${receiptDetailColumns}`}>
              <span>Unidad</span>
              <span>Pendiente</span>
            </div>
            <span>Cantidad recibida</span>
          </div>
          <ul role="list" aria-label="Líneas de la recepción" className="space-y-3 md:divide-y md:space-y-0">
            {lines.map((line, i) => (
              <li
                key={line.purchaseOrderLineId}
                className={`grid gap-y-3 rounded-lg border bg-background p-4 md:items-center md:rounded-none md:border-0 md:bg-transparent md:py-2 md:hover:bg-muted/50 ${receiptRowColumns}`}
              >
                <p className="break-words font-medium leading-snug md:text-sm md:font-normal">{line.description}</p>
                <dl className={`grid grid-cols-2 gap-x-3 gap-y-1 text-sm ${receiptDetailColumns}`}>
                  <div>
                    <dt className="text-xs text-muted-foreground md:sr-only">Unidad</dt>
                    <dd className="break-words md:text-muted-foreground">{line.unit || "—"}</dd>
                  </div>
                  <div className="md:hidden">
                    <dt className="text-xs text-muted-foreground">Pedida</dt>
                    <dd className="tabular-nums">{formatQtyFromString(line.ordered)}</dd>
                  </div>
                  {isPositiveQty(line.previouslyReceived) ? (
                    <div className="md:hidden">
                      <dt className="text-xs text-muted-foreground">Recibida previa</dt>
                      <dd className="tabular-nums">{formatQtyFromString(line.previouslyReceived)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-muted-foreground md:sr-only">Pendiente</dt>
                    <dd className="break-words font-medium tabular-nums md:font-normal">{formatQtyFromString(line.remaining)}</dd>
                  </div>
                </dl>
                <ReceiptQtyInput line={line} index={i} onChange={updateQty} />
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={defaultNotes}
            key={`notes-${defaultNotes}`}
          />
        </div>

        {extraSections}

        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:flex-wrap sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {isEdit ? (
            <>
              <Button
                type="button"
                variant="destructive"
                className={actionBtn}
                disabled={isPending}
                onClick={() => setCancelOpen(true)}
              >
                {pendingAction === "cancel" ? "Anulando…" : "Anular recepción"}
              </Button>
              <Button type="submit" variant="outline" className={actionBtn} disabled={isPending}>
                {pendingAction === "save" ? "Guardando…" : "Guardar borrador"}
              </Button>
              <Button
                type="button"
                className={actionBtn}
                disabled={isPending}
                onClick={handleConfirm}
              >
                {pendingAction === "confirm" ? "Confirmando…" : "Confirmar recepción"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 md:min-h-9"
                disabled={isPending}
                onClick={() => router.back()}
              >
                Cancelar
              </Button>
              <Button type="submit" className="min-h-11 md:min-h-9" disabled={isPending}>
                {pendingAction === "save" ? "Guardando…" : "Guardar borrador"}
              </Button>
            </>
          )}
        </div>
      </fieldset>
</form>
      <ConfirmAlertDialog open={cancelOpen} onOpenChange={(open) => { if (!isRunning()) setCancelOpen(open); }}
        title="Anular recepción en borrador" confirmLabel="Anular recepción" variant="destructive" pending={isPending}
        description={<div className="space-y-2"><p>La recepción quedará anulada. Podés crear otra si necesitás corregir el registro.</p>{error ? <p className="text-destructive" role="alert">{error}</p> : null}</div>}
        onConfirm={handleAnular}
      />
    </div>
  );
}
