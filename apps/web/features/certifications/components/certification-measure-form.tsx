"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { previewCertificationMeasurement } from "@bloqer/services/certification-measurement-pure";
import type { CertificationMeasurementRow, CertificationMeasurementSheet } from "@bloqer/services";
import type { SaveCertificationMeasurementInput } from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  compareQty,
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctWithSymbol,
  formatUnitPriceFromString,
} from "@/lib/format-money";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = { PHYSICAL: "Avance físico", PURCHASED: "Compras", RECEIVED: "Recepciones" };
const pct = (value: string | null) => (value == null ? "—" : formatRatePctWithSymbol(value));

interface Props {
  sheet: CertificationMeasurementSheet;
  row: CertificationMeasurementRow;
  onSave: (data: SaveCertificationMeasurementInput) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
  onSaved: () => void;
}

export function CertificationMeasureForm({ sheet, row, onSave, onClose, onSaved }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [currentQty, setCurrentQty] = useState(row.currentQty ?? row.suggestedQty ?? "");
  const [physicalPct, setPhysicalPct] = useState(row.physicalPct ?? row.suggestedPhysicalPct ?? "");
  const [source, setSource] = useState<string | null>(row.lineId ? null : "PHYSICAL");
  let preview: ReturnType<typeof previewCertificationMeasurement> | null = null;
  try {
    preview = previewCertificationMeasurement({ ...row, currentQty, physicalPct });
  } catch {
    /* Incomplete edit buffer. */
  }

  function handleSave(included = true) {
    setError(null);
    try {
      if (included && (!currentQty || compareQty(currentQty, "0") <= 0)) {
        setError("Indicá una cantidad mayor a 0.");
        return;
      }
      if (
        included &&
        (compareQty(physicalPct || "0", "0") < 0 || compareQty(physicalPct || "0", "100") > 0)
      ) {
        setError("El % físico del período debe estar entre 0 y 100.");
        return;
      }
      if (included && (preview?.overQuantity || preview?.overPhysical)) {
        setError("El acumulado no puede superar el 100%. Revisá los valores de este período.");
        return;
      }
    } catch {
      setError("Revisá la cantidad y el % físico.");
      return;
    }
    startTransition(async () => {
      const result = await onSave({
        certificationId: sheet.certificationId,
        expectedRevision: sheet.revision,
        rows: [{ wbsNodeId: row.wbsNodeId, included, currentQty, physicalPct }],
      });
      if ("error" in result) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(included ? "Medición guardada" : "Partida quitada del certificado");
      router.refresh();
      onSaved();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Medir {row.code}</DialogTitle>
        <DialogDescription>
          {row.name} · {row.unit} · PU venta {formatUnitPriceFromString(row.unitSalePrice)}{" "}
          {sheet.currency}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
        <Ref label="Presupuestado" value={`${formatQtyFromString(row.budgetQty)} ${row.unit}`} />
        <Ref label="Certificado previo" value={pct(row.previousPct)} />
        <Ref
          label="Saldo disponible"
          value={`${formatQtyFromString(row.remainingQty)} ${row.unit}`}
        />
        <Ref label="Físico previo" value={pct(row.previousPhysicalPct)} />
      </div>
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden /> Sugerencias al{" "}
          {sheet.periodEnd.split("-").reverse().join("/")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {row.suggestions.map((suggestion) => (
            <button
              key={suggestion.source}
              type="button"
              disabled={suggestion.quantity == null || pending}
              aria-pressed={source === suggestion.source}
              className={cn(
                "flex min-w-0 flex-col rounded-lg border p-2 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:p-3",
                source === suggestion.source && "border-primary bg-primary/5",
              )}
              onClick={() => {
                setCurrentQty(suggestion.quantity!);
                setSource(suggestion.source);
                if (suggestion.source === "PHYSICAL")
                  setPhysicalPct(row.suggestedPhysicalPct ?? "0");
              }}
            >
              <span className="flex flex-col items-start gap-1 font-medium sm:flex-row sm:items-center sm:justify-between">
                {SOURCE_LABEL[suggestion.source]}{" "}
                <span className="font-mono">{pct(suggestion.progressPct)}</span>
              </span>
              <span className="mt-2 block font-mono text-xs sm:text-sm">
                {suggestion.amount == null
                  ? "Sin referencia"
                  : `${formatMoneyAmount(suggestion.amount)} ${sheet.currency}`}
              </span>
              <span className="mt-1 block text-muted-foreground">
                {suggestion.quantity == null
                  ? "Sin datos comparables para sugerir"
                  : `${formatQtyFromString(suggestion.quantity)} ${row.unit}`}
                {suggestion.quantity != null && (
                  <span className="hidden sm:inline"> pendientes de certificar</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Las sugerencias descuentan lo certificado anteriormente. Compras y recepciones comparan
          costo neto con presupuesto de costo; no cambian el avance físico. Podés modificar los
          valores antes de guardar.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="measurement-qty">Cantidad de este período</Label>
          <DecimalInput
            id="measurement-qty"
            scale={4}
            value={currentQty}
            disabled={pending}
            onValueChange={(value) => {
              setCurrentQty(value);
              setSource(null);
            }}
            aria-label={`Cantidad ${row.code}`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="measurement-physical">% físico de este período</Label>
          <DecimalInput
            id="measurement-physical"
            scale={4}
            value={physicalPct}
            disabled={pending}
            onValueChange={setPhysicalPct}
            aria-label={`Porcentaje físico ${row.code}`}
          />
        </div>
      </div>
      <div
        className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4"
        aria-live="polite"
      >
        <Ref
          label="Monto a certificar"
          value={preview ? `${formatMoneyAmount(preview.periodAmount)} ${sheet.currency}` : "—"}
        />
        <Ref label="Certificado acumulado" value={pct(preview?.cumulativePct ?? null)} />
        <Ref label="Físico acumulado" value={pct(preview?.cumulativePhysicalPct ?? null)} />
        <Ref
          label="Saldo luego de guardar"
          value={preview ? `${formatQtyFromString(preview.remainingQty)} ${row.unit}` : "—"}
        />
      </div>
      {(preview?.overQuantity || preview?.overPhysical) && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {preview?.overQuantity
            ? "La cantidad supera el saldo del presupuesto."
            : "El avance físico acumulado supera el 100%."}{" "}
          Revisá los certificados anteriores y reducí el valor de este período.
        </p>
      )}
      <details className="rounded-lg border px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">Ver libro y costos de referencia</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Ref
            label="Libro acumulado al corte"
            value={`${formatQtyFromString(row.logQtyAcum)} ${row.unit} · ${pct(row.logPctAcum)}`}
          />
          <Ref
            label="Libro del período"
            value={`${formatQtyFromString(row.logQtyPeriod)} ${row.unit} · ${pct(row.logPctPeriod)}`}
          />
          {sheet.costAvailable && row.cost && (
            <>
              <Ref
                label="Comprometido del período"
                value={formatMoneyAmount(row.cost.committedCost)}
              />
              <Ref label="Consumido del período" value={formatMoneyAmount(row.cost.consumedCost)} />
              <Ref label="Mano de obra" value={formatMoneyAmount(row.cost.laborCost)} />
              <Ref label="Equipos" value={formatMoneyAmount(row.cost.equipmentCost)} />
              <Ref label="Subcontratos" value={formatMoneyAmount(row.cost.subcontractCost)} />
            </>
          )}
        </div>
        <p className="mt-3 text-muted-foreground">
          El monto a certificar se calcula con el precio de venta de la partida. Los costos son
          referencias separadas.
        </p>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        {row.lineId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto text-destructive"
            disabled={pending}
            onClick={() => handleSave(false)}
          >
            Quitar partida
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => handleSave()}
          disabled={pending || preview?.overQuantity || preview?.overPhysical}
        >
          {pending ? "Guardando…" : "Guardar medición"}
        </Button>
      </div>
    </>
  );
}

function Ref({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
