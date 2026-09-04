"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addDecimal, compareDecimal, resolveDocumentLineAmounts } from "@bloqer/utils";
import { IVA_RATE_LABEL_ES, IVA_RATE_PRESETS, normalizeIvaRatePreset } from "@bloqer/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import type { SupplierOption } from "./purchase-order-form";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, toSearchableOptions } from "@/lib/searchable-options";
import { formatMoneyAmount, formatQtyFromString, formatUnitPriceFromString } from "@/lib/format-money";
import { PricesIncludeTaxCheckbox } from "@/features/finance/components/invoice-letter-fields";
import {
  createProcurementQuoteAction,
  deleteProcurementQuoteAction,
  selectQuoteAndCreatePoAction,
  updateProcurementQuoteAction,
} from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";

type PrLine = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  budgetUnitCostSnapshot?: string | null;
};

type LineMoney = { unitPrice: string; discountPct: string; taxRate: string };

type QuoteLineInitial = {
  purchaseRequestLineId: string;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
};

export type ProcurementQuoteEditValues = {
  quoteId: string;
  supplierName: string;
  validUntil: string | null;
  leadTimeDays: number | null;
  lines: QuoteLineInitial[];
};

interface ProcurementQuoteFormProps {
  projectId: string;
  purchaseRequestId: string;
  suppliers: SupplierOption[];
  lines: PrLine[];
  mode?: "create" | "edit";
  editValues?: ProcurementQuoteEditValues;
  onCancelEdit?: () => void;
}

function linePreview(
  qty: string,
  unitPrice: string,
  taxRate: string,
  discountPct: string,
  pricesIncludeTax: boolean,
) {
  try {
    return resolveDocumentLineAmounts({
      quantity: qty,
      unitPrice,
      taxRatePercent: taxRate,
      discountPct,
      pricesIncludeTax,
    });
  } catch {
    return null;
  }
}

export function ProcurementQuoteForm({
  projectId,
  purchaseRequestId,
  suppliers,
  lines,
  mode = "create",
  editValues,
  onCancelEdit,
}: ProcurementQuoteFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = mode === "edit" && editValues != null;

  const lineInitialByPrId = useMemo(() => {
    const map = new Map<string, QuoteLineInitial>();
    for (const l of editValues?.lines ?? []) {
      map.set(l.purchaseRequestLineId, l);
    }
    return map;
  }, [editValues?.lines]);

  const defaultTaxRate =
    normalizeIvaRatePreset(editValues?.lines[0]?.taxRate) ?? "21";

  const [supplierId, setSupplierId] = useState("");
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [taxRate, setTaxRate] = useState<string>(defaultTaxRate);
  const [lineMoney, setLineMoney] = useState<Record<string, LineMoney>>(() =>
    Object.fromEntries(
      lines.map((l) => {
        const initial = lineInitialByPrId.get(l.id);
        return [
          l.id,
          {
            unitPrice: initial?.unitPrice ?? "0",
            discountPct: initial?.discountPct ?? "0",
            taxRate: normalizeIvaRatePreset(initial?.taxRate) ?? defaultTaxRate,
          },
        ];
      }),
    ),
  );

  function applyGlobalTaxRate(next: string) {
    setTaxRate(next);
    setLineMoney((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, row]) => [id, { ...row, taxRate: next }]),
      ),
    );
  }

  function hasPositiveUnitPrice(): boolean {
    return lines.some((line) => compareDecimal(lineMoney[line.id]?.unitPrice ?? "0", "0") > 0);
  }

  const quoteTotal = useMemo(() => {
    let total = "0";
    for (const line of lines) {
      const money = lineMoney[line.id];
      const preview = linePreview(
        line.quantity,
        money?.unitPrice ?? "0",
        money?.taxRate ?? taxRate,
        money?.discountPct ?? "0",
        pricesIncludeTax,
      );
      if (!preview) continue;
      total = addDecimal(total, preview.lineTotal);
    }
    return total;
  }, [lineMoney, lines, pricesIncludeTax, taxRate]);

  function buildPayload(
    leadTimeDays: number | null,
    validUntil: string | null,
  ) {
    return {
      purchaseRequestId,
      supplierContactId: supplierId,
      currency: "ARS" as const,
      validUntil,
      leadTimeDays,
      pricesIncludeTax,
      lines: lines.map((line, i) => ({
        purchaseRequestLineId: line.id,
        unitPrice: lineMoney[line.id]?.unitPrice ?? "0",
        taxRate: lineMoney[line.id]?.taxRate ?? taxRate,
        discountPct: lineMoney[line.id]?.discountPct ?? "0",
        sortOrder: i,
      })),
    };
  }

  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      action={(fd) => {
        startTransition(async () => {
          setError(null);
          if (!isEdit && !supplierId) {
            setError("Seleccioná un proveedor");
            return;
          }
          if (!hasPositiveUnitPrice()) {
            setError("Ingresá al menos un precio unitario mayor a cero.");
            return;
          }
          const leadRaw = fd.get("leadTimeDays")?.toString() ?? "";
          const leadTimeDays =
            leadRaw.trim() === "" ? null : Number.parseInt(leadRaw, 10);
          if (leadTimeDays != null && (Number.isNaN(leadTimeDays) || leadTimeDays < 0)) {
            setError("Plazo de entrega inválido");
            return;
          }
          const validUntil = fd.get("validUntil")?.toString() || null;
          const payload = buildPayload(leadTimeDays, validUntil);

          const result = isEdit
            ? await updateProcurementQuoteAction(projectId, editValues!.quoteId, purchaseRequestId, {
                currency: payload.currency,
                validUntil: payload.validUntil,
                leadTimeDays: payload.leadTimeDays,
                pricesIncludeTax: payload.pricesIncludeTax,
                lines: payload.lines,
              })
            : await createProcurementQuoteAction(projectId, payload);

          if ("error" in result) {
            setError(result.error);
            return;
          }
          toast.success(isEdit ? "Cotización actualizada." : "Cotización registrada.");
          onCancelEdit?.();
          router.refresh();
        });
      }}
    >
      <p className="font-medium text-sm">{isEdit ? "Editar cotización" : "Cargar cotización"}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isEdit ? (
        <div className="space-y-1">
          <Label>Proveedor</Label>
          <p className="text-sm font-medium">{editValues.supplierName}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Proveedor</Label>
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay proveedores activos. Cree un contacto con rol Proveedor primero.
            </p>
          ) : (
            <SearchableCombobox
              popoverWidth="wide"
              options={toSearchableOptions(suppliers)}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="Elegir proveedor…"
              searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
              emptyText="Ningún proveedor coincide."
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={isEdit ? "editLeadTimeDays" : "leadTimeDays"}>Plazo de entrega (días)</Label>
          <Input
            id={isEdit ? "editLeadTimeDays" : "leadTimeDays"}
            name="leadTimeDays"
            type="number"
            min={0}
            placeholder="ej. 7"
            defaultValue={editValues?.leadTimeDays ?? undefined}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={isEdit ? "editValidUntil" : "validUntil"}>Vigencia hasta</Label>
          <Input
            id={isEdit ? "editValidUntil" : "validUntil"}
            name="validUntil"
            type="date"
            defaultValue={editValues?.validUntil ?? undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="quoteTaxRate">Alícuota IVA</Label>
          <Select value={taxRate} onValueChange={applyGlobalTaxRate}>
            <SelectTrigger id="quoteTaxRate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IVA_RATE_PRESETS.map((rate) => (
                <SelectItem key={rate} value={rate}>
                  {IVA_RATE_LABEL_ES[rate]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PricesIncludeTaxCheckbox
          checked={pricesIncludeTax}
          onCheckedChange={setPricesIncludeTax}
          editModeHint={isEdit}
        />
      </div>

      {lines.map((line) => {
        const money = lineMoney[line.id] ?? { unitPrice: "0", discountPct: "0", taxRate };
        const preview = linePreview(
          line.quantity,
          money.unitPrice,
          money.taxRate,
          money.discountPct,
          pricesIncludeTax,
        );
        return (
          <div key={line.id} className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
            <div>
              <p className="font-medium">{line.description}</p>
              <p className="text-muted-foreground">
                {formatQtyFromString(line.quantity)} {line.unit}
                {line.budgetUnitCostSnapshot
                  ? ` · ref. presup. ${formatUnitPriceFromString(line.budgetUnitCostSnapshot)}`
                  : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor={`unitPrice_${line.id}`}>
                  {pricesIncludeTax ? "Precio unit. (c/IVA)" : "Precio unit."}
                </Label>
                <DecimalInput
                  id={`unitPrice_${line.id}`}
                  value={money.unitPrice}
                  onValueChange={(v) =>
                    setLineMoney((prev) => ({
                      ...prev,
                      [line.id]: {
                        unitPrice: v,
                        discountPct: prev[line.id]?.discountPct ?? "0",
                        taxRate: prev[line.id]?.taxRate ?? taxRate,
                      },
                    }))
                  }
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`discountPct_${line.id}`}>Desc. %</Label>
                <DecimalInput
                  id={`discountPct_${line.id}`}
                  value={money.discountPct}
                  onValueChange={(v) =>
                    setLineMoney((prev) => ({
                      ...prev,
                      [line.id]: {
                        unitPrice: prev[line.id]?.unitPrice ?? "0",
                        discountPct: v,
                        taxRate: prev[line.id]?.taxRate ?? taxRate,
                      },
                    }))
                  }
                  placeholder="0"
                />
              </div>
              {preview ? (
                <div className="col-span-2 space-y-0.5 self-end text-xs text-muted-foreground">
                  <p>Neto: {formatMoneyAmount(preview.lineSubtotal, "ARS")}</p>
                  <p>IVA: {formatMoneyAmount(preview.lineTax, "ARS")}</p>
                  <p className="font-medium text-foreground">
                    Total línea: {formatMoneyAmount(preview.lineTotal, "ARS")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
        <p>
          <span className="text-muted-foreground">Total cotización (con IVA): </span>
          <span className="font-semibold tabular-nums">
            {formatMoneyAmount(quoteTotal, "ARS")}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending || (!isEdit && suppliers.length === 0)}>
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar cotización"}
        </Button>
        {isEdit && onCancelEdit ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancelEdit}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function SelectQuoteButton({
  quoteId,
  projectId,
  purchaseRequestId,
}: {
  quoteId: string;
  projectId: string;
  purchaseRequestId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await selectQuoteAndCreatePoAction(
            quoteId,
            projectId,
            purchaseRequestId,
          );
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          router.push(`/proyectos/${projectId}/ordenes-compra/${result.purchaseOrderId}`);
          router.refresh();
        });
      }}
    >
      {pending ? "Generando OC…" : "Adjudicar libres → OC"}
    </Button>
  );
}

export function ProcurementQuoteRowActions({
  quoteId,
  projectId,
  purchaseRequestId,
  canManage,
  onEdit,
  onDeleted,
}: {
  quoteId: string;
  projectId: string;
  purchaseRequestId: string;
  canManage: boolean;
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!canManage) return null;

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onEdit}>
        Editar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={() => setDeleteOpen(true)}
      >
        Eliminar
      </Button>
      <ConfirmAlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar cotización?"
        description="Se borra la cotización y sus importes. Podés cargar una nueva del mismo proveedor después."
        confirmLabel="Eliminar"
        variant="destructive"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            const result = await deleteProcurementQuoteAction(
              quoteId,
              projectId,
              purchaseRequestId,
            );
            if ("error" in result) {
              toast.error(result.error);
              return;
            }
            toast.success("Cotización eliminada.");
            setDeleteOpen(false);
            onDeleted?.();
            router.refresh();
          });
        }}
      />
    </div>
  );
}
