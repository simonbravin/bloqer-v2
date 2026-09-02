"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { SEARCHABLE_NONE, toSearchableOptions, withNoneOption, wbsToSearchableOptions } from "@/lib/searchable-options";
import { DecimalInput } from "@/components/ui/decimal-input";
import { UnitSelect } from "@/features/budgets/components/unit-select";
import { budgetUnitLabel } from "@/lib/budget-units";
import { formatDecimalArFromString, formatQtyDisplay } from "@/lib/format-money";
import type { WbsApuOption, WbsOption } from "./purchase-order-lines-editor";
import { createPurchaseRequestAction } from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";
import {
  apuCommitmentHintText,
  applyApuToPurchaseRequestLine,
  availableApuLinesForRow,
  computeApuCoverage,
  computeApuLineEstimatedAmount,
  createEmptyPurchaseRequestLine,
  createPurchaseRequestLineFromInitial,
  formatApuCoverageHint,
  mergeApuShortfallLines,
  preparePurchaseRequestLinesForSubmit,
  sumPurchaseRequestApuEstimates,
  type PurchaseRequestApuLine,
  type PurchaseRequestLineDraft,
} from "../lib/purchase-request-form-lines";

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
  /** Origin board for banner (`materiales` | `mano-obra` | `equipos`). */
  prefillFrom?: "materiales" | "mano-obra" | "equipos";
  variant?: "card" | "plain";
  extraSections?: React.ReactNode;
  onCancel?: () => void;
  onSuccess?: () => void;
  onCreated?: (id: string) => Promise<{ navigate?: boolean; message?: string } | void>;
}

function apuComboboxOptions(apuLines: PurchaseRequestApuLine[]) {
  return withNoneOption(
    toSearchableOptions(
      apuLines.map((a) => ({
        id: a.id,
        label:
          a.shortfallQty != null || a.quantity != null
            ? `${a.description} (faltante ${formatQtyDisplay(a.shortfallQty ?? a.quantity)} ${budgetUnitLabel(a.unit)})`
            : `${a.description} (${budgetUnitLabel(a.unit)})`,
      })),
    ),
    { label: "Sin insumo APU" },
  );
}

const EMPTY_APU_LINES: WbsApuOption[] = [];

export function PurchaseRequestForm({
  projectId,
  wbsOptions,
  initialLine,
  prefilledFromMaterials = false,
  prefillFrom,
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
  const [lines, setLines] = useState<PurchaseRequestLineDraft[]>(() => {
    const base =
      initialLine?.description || initialLine?.costAnalysisLineId
        ? createPurchaseRequestLineFromInitial(initialLine)
        : createEmptyPurchaseRequestLine(initialLine?.unit ?? "");
    if (initialLine?.costAnalysisLineId && initialLine.wbsNodeId) {
      const wbs = wbsOptions.find((w) => w.id === initialLine.wbsNodeId);
      const apu = wbs?.apuLines?.find((a) => a.id === initialLine.costAnalysisLineId);
      if (apu) {
        return [
          applyApuToPurchaseRequestLine(base, apu, {
            keepQuantity: Boolean(initialLine.quantity),
          }),
        ];
      }
    }
    return [base];
  });

  const wbsComboboxOptions = useMemo(() => wbsToSearchableOptions(wbsOptions), [wbsOptions]);
  const selectedWbs = useMemo(
    () => wbsOptions.find((w) => w.id === wbsNodeId),
    [wbsOptions, wbsNodeId],
  );
  const apuCatalog = selectedWbs?.apuLines ?? EMPTY_APU_LINES;
  const apuCoverage = useMemo(
    () => computeApuCoverage(apuCatalog, lines),
    [apuCatalog, lines],
  );
  const coverageHint = formatApuCoverageHint(apuCoverage);
  const draftEstimateTotal = useMemo(
    () => sumPurchaseRequestApuEstimates(lines, apuCatalog),
    [lines, apuCatalog],
  );

  function onWbsChange(nextWbsId: string) {
    setWbsNodeId(nextWbsId);
    const wbs = wbsOptions.find((w) => w.id === nextWbsId);
    setLines([createEmptyPurchaseRequestLine(wbs?.budgetUnit ?? "")]);
  }

  function updateLine(rowKey: string, patch: Partial<PurchaseRequestLineDraft>) {
    setLines((prev) => prev.map((l) => (l.rowKey === rowKey ? { ...l, ...patch } : l)));
  }

  function applyApuOnLine(rowKey: string, apuId: string | null) {
    const apu = apuId ? apuCatalog.find((a) => a.id === apuId) : null;
    setLines((prev) =>
      prev.map((l) =>
        l.rowKey === rowKey ? applyApuToPurchaseRequestLine(l, apu ?? undefined) : l,
      ),
    );
  }

  function addEmptyLine() {
    setLines((prev) => [...prev, createEmptyPurchaseRequestLine(selectedWbs?.budgetUnit ?? "")]);
  }

  function addShortfallLines() {
    setLines((prev) =>
      mergeApuShortfallLines(apuCatalog, prev, selectedWbs?.budgetUnit ?? ""),
    );
  }

  function removeLine(rowKey: string) {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((l) => l.rowKey !== rowKey);
    });
  }

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
            const neededByDate = fd.get("neededByDate")?.toString() ?? "";
            if (!/^\d{4}-\d{2}-\d{2}$/.test(neededByDate)) {
              setError("La fecha requerida es obligatoria");
              return;
            }
            const prepared = preparePurchaseRequestLinesForSubmit(
              lines,
              wbsNodeId,
              selectedWbs?.budgetUnit ?? "un",
              apuCatalog,
            );
            if (!prepared.ok) {
              setError(prepared.error);
              return;
            }
            const result = await createPurchaseRequestAction(projectId, {
              projectId,
              neededByDate,
              notes: fd.get("notes")?.toString() || null,
              lines: prepared.lines,
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
            Prefill desde{" "}
            {prefillFrom === "mano-obra"
              ? "Mano de obra"
              : prefillFrom === "equipos"
                ? "Equipos"
                : "Materiales"}{" "}
            (faltante). Revisá cantidad y partida antes de crear. Podés agregar más insumos de la misma partida.
          </p>
        ) : null}

        {error ? (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

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
            {selectedWbs?.availableSaldo != null ? (
              <p className="text-xs text-muted-foreground">
                Saldo disponible partida: {formatDecimalArFromString(selectedWbs.availableSaldo)}
              </p>
            ) : null}
            {selectedWbs?.wouldExceedBudget ? (
              <p className="text-xs text-destructive">
                Este ítem ya está cerca o por encima del saldo disponible.
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold">Qué necesito</h2>
            <div className="flex flex-wrap gap-2">
              {apuCoverage.remainingWithShortfallCount > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-9"
                  disabled={!wbsNodeId}
                  onClick={addShortfallLines}
                >
                  Agregar faltantes ({apuCoverage.remainingWithShortfallCount})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                disabled={!wbsNodeId}
                onClick={addEmptyLine}
              >
                + Agregar insumo
              </Button>
            </div>
          </div>

          {wbsNodeId && coverageHint ? (
            <p className="text-xs text-muted-foreground">{coverageHint}</p>
          ) : null}
          {wbsNodeId && draftEstimateTotal ? (
            <p className="text-xs font-medium text-muted-foreground">
              Monto est. solicitud (insumos APU): {formatDecimalArFromString(draftEstimateTotal)}
            </p>
          ) : null}

          {!wbsNodeId ? (
            <p className="text-sm text-muted-foreground">Elegí primero un ítem EDT.</p>
          ) : (
            <div className="space-y-4">
              {lines.map((line, index) => {
                const rowApuOptions = availableApuLinesForRow(apuCatalog, lines, line.rowKey);
                const boundApu = line.costAnalysisLineId
                  ? apuCatalog.find((a) => a.id === line.costAnalysisLineId)
                  : null;
                const hint = boundApu
                  ? apuCommitmentHintText(
                      boundApu,
                      formatQtyDisplay,
                      budgetUnitLabel,
                    )
                  : null;
                const lineEstimate =
                  boundApu != null
                    ? computeApuLineEstimatedAmount(line.quantity, boundApu.unitCost)
                    : null;

                return (
                  <section
                    key={line.rowKey}
                    aria-label={`Línea ${index + 1}`}
                    className="form-section space-y-3 p-3 sm:p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Línea {index + 1}
                      </span>
                      {lines.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-9 text-destructive hover:text-destructive"
                          onClick={() => removeLine(line.rowKey)}
                          aria-label={`Quitar línea ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`pr-apu-${line.rowKey}`}>Insumo APU (opcional)</Label>
                      <SearchableCombobox
                        id={`pr-apu-${line.rowKey}`}
                        popoverWidth="wide"
                        options={apuComboboxOptions(rowApuOptions)}
                        value={line.costAnalysisLineId ?? SEARCHABLE_NONE}
                        onValueChange={(v) =>
                          applyApuOnLine(line.rowKey, v === SEARCHABLE_NONE ? null : v)
                        }
                        placeholder="Elegir material del APU…"
                        searchPlaceholder="Buscar insumo…"
                        disabled={apuCatalog.length === 0}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`description-${line.rowKey}`}>Descripción / material</Label>
                      <Input
                        id={`description-${line.rowKey}`}
                        className="min-h-11 md:min-h-9"
                        value={line.description}
                        onChange={(e) => updateLine(line.rowKey, { description: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`quantity-${line.rowKey}`}>Cantidad</Label>
                        <DecimalInput
                          id={`quantity-${line.rowKey}`}
                          className="min-h-11 md:min-h-9"
                          value={line.quantity}
                          onValueChange={(v) => updateLine(line.rowKey, { quantity: v })}
                          placeholder="1,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`unit-${line.rowKey}`}>Unidad</Label>
                        <UnitSelect
                          value={line.unit || selectedWbs?.budgetUnit || "un"}
                          onChange={(v) => updateLine(line.rowKey, { unit: v })}
                        />
                      </div>
                    </div>

                    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
                    {boundApu?.unitCost ? (
                      <p className="text-xs text-muted-foreground">
                        Ref. presup.: {formatDecimalArFromString(boundApu.unitCost)}/u
                        {lineEstimate ? ` · Monto est.: ${formatDecimalArFromString(lineEstimate)}` : ""}
                      </p>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Al elegir un insumo se precarga descripción, unidad y faltante (necesidad − ya pedido). Podés agregar varios insumos de la misma partida en una sola solicitud.
          </p>
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
            disabled={pending || wbsOptions.length === 0 || !wbsNodeId}
          >
            {pending ? "Guardando…" : "Crear solicitud"}
          </Button>
        </div>
      </form>
    </div>
  );
}
