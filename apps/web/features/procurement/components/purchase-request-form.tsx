"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { SEARCHABLE_NONE, toSearchableOptions, withNoneOption, wbsToSearchableOptions } from "@/lib/searchable-options";
import { DecimalInput } from "@/components/ui/decimal-input";
import { UnitSelect } from "@/features/budgets/components/unit-select";
import { budgetUnitLabel } from "@/lib/budget-units";
import { formatDecimalArFromString, formatQtyDisplay, isPositiveQty } from "@/lib/format-money";
import type { WbsApuOption, WbsOption } from "./purchase-order-lines-editor";
import { createPurchaseRequestAction } from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";

function apuCommitmentHint(apu: WbsApuOption): string {
  const u = budgetUnitLabel(apu.unit);
  if (apu.needQty != null || apu.orderedQty != null) {
    return `Necesidad ${formatQtyDisplay(apu.needQty)} · Pedido ${formatQtyDisplay(apu.orderedQty)} · Faltante ${formatQtyDisplay(apu.shortfallQty ?? apu.quantity)} ${u}`;
  }
  return `Ref. APU: ${formatQtyDisplay(apu.quantity)} ${u}`;
}

interface PurchaseRequestFormProps {
  projectId: string;
  wbsOptions: WbsOption[];
  initialLine?: {
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
    costAnalysisLineId?: string;
    unit?: string;
  };
  prefilledFromMaterials?: boolean;
  variant?: "card" | "plain";
  extraSections?: React.ReactNode;
  onCancel?: () => void;
  onSuccess?: () => void;
  onCreated?: (id: string) => Promise<{ navigate?: boolean; message?: string } | void>;
}

export function PurchaseRequestForm({
  projectId,
  wbsOptions,
  initialLine,
  prefilledFromMaterials = false,
  variant = "card",
  extraSections,
  onCancel,
  onSuccess,
  onCreated,
}: PurchaseRequestFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wbsNodeId, setWbsNodeId] = useState<string>(initialLine?.wbsNodeId ?? "");
  const [costAnalysisLineId, setCostAnalysisLineId] = useState<string | null>(
    initialLine?.costAnalysisLineId ?? null,
  );
  const [description, setDescription] = useState(initialLine?.description ?? "");
  const [quantity, setQuantity] = useState(initialLine?.quantity ?? "1");
  const [unit, setUnit] = useState(initialLine?.unit ?? "");
  const [productId, setProductId] = useState<string | null>(initialLine?.productId ?? null);
  const [apuHint, setApuHint] = useState<string | null>(null);

  const wbsComboboxOptions = useMemo(() => wbsToSearchableOptions(wbsOptions), [wbsOptions]);
  const selectedWbs = wbsOptions.find((w) => w.id === wbsNodeId);
  const apuOptions = useMemo(
    () =>
      withNoneOption(
        toSearchableOptions(
          (selectedWbs?.apuLines ?? []).map((a) => ({
            id: a.id,
            label:
              a.shortfallQty != null || a.quantity != null
                ? `${a.description} (faltante ${formatQtyDisplay(a.shortfallQty ?? a.quantity)} ${budgetUnitLabel(a.unit)})`
                : `${a.description} (${budgetUnitLabel(a.unit)})`,
          })),
        ),
        { label: "Sin insumo APU" },
      ),
    [selectedWbs],
  );

  function applyApu(apuId: string | null, opts?: { keepQuantity?: boolean }) {
    if (!apuId) {
      setCostAnalysisLineId(null);
      setApuHint(null);
      return;
    }
    const apu = selectedWbs?.apuLines?.find((a) => a.id === apuId);
    if (!apu) {
      setCostAnalysisLineId(apuId);
      setApuHint(null);
      return;
    }
    setCostAnalysisLineId(apu.id);
    setDescription(apu.description);
    setUnit(apu.unit);
    setProductId(apu.productId);
    if (!opts?.keepQuantity && isPositiveQty(apu.quantity)) {
      setQuantity(apu.quantity ?? "");
    }
    setApuHint(apuCommitmentHint(apu));
  }

  function onWbsChange(nextWbsId: string) {
    setWbsNodeId(nextWbsId);
    setCostAnalysisLineId(null);
    setApuHint(null);
    const wbs = wbsOptions.find((w) => w.id === nextWbsId);
    if (wbs?.budgetUnit && !unit) setUnit(wbs.budgetUnit);
  }

  useEffect(() => {
    if (!initialLine?.costAnalysisLineId || !wbsNodeId) return;
    const wbs = wbsOptions.find((w) => w.id === wbsNodeId);
    const apu = wbs?.apuLines?.find((a) => a.id === initialLine.costAnalysisLineId);
    if (!apu) return;
    if (!unit) setUnit(apu.unit || initialLine.unit || "");
    setApuHint(apuCommitmentHint(apu));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount / initial APU
  }, [initialLine?.costAnalysisLineId, wbsNodeId, wbsOptions]);

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-4 sm:p-6" : undefined}>
      <form
        className="space-y-5"
        action={(fd) => {
          startTransition(async () => {
            setError(null);
            if (!wbsNodeId) {
              setError("Seleccioná un ítem EDT");
              return;
            }
            if (!isPositiveQty(quantity)) {
              setError("La cantidad debe ser mayor a cero");
              return;
            }
            const neededByDate = fd.get("neededByDate")?.toString() ?? "";
            if (!/^\d{4}-\d{2}-\d{2}$/.test(neededByDate)) {
              setError("La fecha requerida es obligatoria");
              return;
            }
            const result = await createPurchaseRequestAction(projectId, {
              projectId,
              neededByDate,
              notes: fd.get("notes")?.toString() || null,
              lines: [
                {
                  wbsNodeId,
                  lineType: "MATERIAL",
                  productId,
                  costAnalysisLineId,
                  description: description.trim() || (fd.get("description")?.toString() ?? ""),
                  unit: unit || selectedWbs?.budgetUnit || "un",
                  quantity,
                  sortOrder: 0,
                },
              ],
            });
            if ("error" in result) {
              setError(result.error);
              return;
            }
            let created: { navigate?: boolean; message?: string } | void = undefined;
            try {
              created = await onCreated?.(result.id);
            } catch {
              created = {
                navigate: false,
                message: "Solicitud creada correctamente. Algún archivo no pudo subirse.",
              };
            }
            if (created?.message) {
              toast.warning(created.message);
            } else {
              toast.success("Solicitud creada.");
            }
            if (created?.navigate === false) {
              return;
            }
            onSuccess?.();
            router.replace(`/proyectos/${projectId}/solicitudes-compra/${result.id}`);
            router.refresh();
          });
        }}
      >
        {prefilledFromMaterials ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Prefill desde Materiales (faltante). Revisá cantidad y partida antes de crear.
          </p>
        ) : null}

        {error ? (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Qué necesito</h2>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción / material</Label>
            <Input
              id="description"
              name="description"
              required
              className="min-h-11 md:min-h-9"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Cantidad</Label>
              <DecimalInput
                id="quantity"
                name="quantity"
                className="min-h-11 md:min-h-9"
                value={quantity}
                onValueChange={setQuantity}
                placeholder="1,00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unidad</Label>
              <UnitSelect
                value={unit || selectedWbs?.budgetUnit || "un"}
                onChange={setUnit}
              />
            </div>
          </div>
          {apuHint ? <p className="text-xs text-muted-foreground">{apuHint}</p> : null}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Dónde se usa</h2>
          <div className="space-y-2">
            <Label htmlFor="pr-wbs">Ítem EDT (obligatorio)</Label>
            {wbsOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay ítems EDT en presupuestos aprobados/cerrados.
              </p>
            ) : (
              <SearchableCombobox
                id="pr-wbs"
                popoverWidth="wide"
                options={wbsComboboxOptions}
                value={wbsNodeId}
                onValueChange={onWbsChange}
                placeholder="Elegir partida…"
                searchPlaceholder="Buscar partida…"
              />
            )}
            {selectedWbs?.budgetUnitCost != null ? (
              <p className="text-xs text-muted-foreground">
                Costo ref. materiales: {formatDecimalArFromString(selectedWbs.budgetUnitCost)}
                {selectedWbs?.availableSaldo != null
                  ? ` · Saldo disponible: ${formatDecimalArFromString(selectedWbs.availableSaldo)}`
                  : ""}
              </p>
            ) : null}
            {selectedWbs?.wouldExceedBudget ? (
              <p className="text-xs text-destructive">
                Este ítem ya está cerca o por encima del saldo disponible.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-apu">Insumo APU (opcional)</Label>
            <SearchableCombobox
              id="pr-apu"
              popoverWidth="wide"
              options={apuOptions}
              value={costAnalysisLineId ?? SEARCHABLE_NONE}
              onValueChange={(v) => applyApu(v === SEARCHABLE_NONE ? null : v)}
              placeholder="Elegir material del APU…"
              searchPlaceholder="Buscar insumo…"
              disabled={!wbsNodeId || (selectedWbs?.apuLines?.length ?? 0) === 0}
            />
            <p className="text-xs text-muted-foreground">
              Al elegir un insumo se precarga el faltante (necesidad − ya pedido). Editable.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Cuándo</h2>
          <div className="space-y-2">
            <Label htmlFor="neededByDate">
              Fecha requerida <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <Input
              id="neededByDate"
              name="neededByDate"
              type="date"
              required
              aria-required="true"
              className="min-h-11 md:min-h-9"
            />
            <p className="text-xs text-muted-foreground">
              Cuándo se necesita el material en obra. Es obligatoria para priorizar cotizaciones y entregas.
            </p>
          </div>
        </section>

        {extraSections}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Observaciones</h2>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <AutoGrowTextarea id="notes" name="notes" />
          </div>
        </section>

        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:min-h-9"
            onClick={onCancel ?? (() => router.back())}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="min-h-11 md:min-h-9"
            data-testid="purchase-request-create-submit"
            disabled={pending || wbsOptions.length === 0}
          >
            {pending ? "Guardando…" : "Crear solicitud"}
          </Button>
        </div>
      </form>
    </div>
  );
}
