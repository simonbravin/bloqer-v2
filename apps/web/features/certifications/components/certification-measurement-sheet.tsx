"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { addDecimal } from "@bloqer/utils";
import type { CertificationMeasurementRow, CertificationMeasurementSheet } from "@bloqer/services";
import type { SaveCertificationMeasurementInput } from "@bloqer/validators";
import {
  compareQty,
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctWithSymbol,
  formatUnitPriceFromString,
} from "@/lib/format-money";

type Sheet = CertificationMeasurementSheet;
type Row = CertificationMeasurementRow;

interface Props {
  sheet: Sheet;
  editable: boolean;
  onSave: (data: SaveCertificationMeasurementInput) => Promise<{ ok: true } | { error: string }>;
}

export function CertificationMeasurementWorksheet({ sheet, editable, onSave }: Props) {
  const signature = useMemo(
    () => `${sheet.revision}|${sheet.rows.map((row) => `${row.wbsNodeId}:${row.lineId ?? ""}:${row.currentQty ?? ""}:${row.physicalPct ?? ""}`).join("|")}`,
    [sheet.revision, sheet.rows],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lock, setLock] = useState<string | null>(null);
  if (lock && lock !== signature) setLock(null);
  const refreshing = lock != null;
  const active = sheet.rows.find((row) => row.wbsNodeId === activeId) ?? null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Planilla de medición</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          La cantidad a certificar empieza vacía. Medir abre el saldo, el libro y el costo del período
          {sheet.costAvailable ? ` (${sheet.currency})` : ""}. Esos datos son referencia: no definen la cantidad.
        </p>
      </div>

      {sheet.rows.length === 0 ? (
        <ListEmptyState
          title="Sin partidas"
          description="El presupuesto no tiene partidas para certificar."
        />
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partida</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Libro período</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">% físico</TableHead>
                {editable ? <TableHead className="w-[88px]" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.rows.map((row) => (
                <SheetRow
                  key={row.wbsNodeId}
                  row={row}
                  editable={editable && !refreshing}
                  onMeasure={() => setActiveId(row.wbsNodeId)}
                />
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}

      <Dialog open={active != null} onOpenChange={(open) => { if (!open) setActiveId(null); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
          {active ? (
            <MeasureForm
              key={active.wbsNodeId}
              sheet={sheet}
              row={active}
              onSave={onSave}
              onClose={() => setActiveId(null)}
              onSaved={() => {
                setLock(signature);
                setActiveId(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SheetRow({ row, editable, onMeasure }: { row: Row; editable: boolean; onMeasure: () => void }) {
  const included = row.lineId != null;
  let over = false;
  if (included && row.currentQty) {
    try {
      over = compareQty(addDecimal(row.previousQty, row.currentQty), row.budgetQty) > 0;
    } catch {
      over = false;
    }
  }

  return (
    <TableRow>
      <TableCell className="max-w-[240px]">
        <p className="font-mono text-xs">{row.code}</p>
        <p className="truncate text-sm">{row.name}</p>
        <p className="text-[11px] text-muted-foreground">{row.unit || "—"}</p>
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{formatQtyFromString(row.remainingQty)}</TableCell>
      <TableCell className="text-right font-mono text-xs">
        {formatQtyFromString(row.logQtyPeriod)}
        <span className="block text-muted-foreground">{formatRatePctWithSymbol(row.logPctPeriod)}</span>
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {included && row.currentQty ? formatQtyFromString(row.currentQty) : "—"}
        {over ? (
          <Badge variant="outline" className="mt-1 border-amber-500 text-amber-600 dark:text-amber-400">
            Supera
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {included && row.physicalPct ? formatRatePctWithSymbol(row.physicalPct) : "—"}
      </TableCell>
      {editable ? (
        <TableCell>
          <Button type="button" variant="outline" size="sm" onClick={onMeasure}>
            {included ? "Editar" : "Medir"}
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function MeasureForm({
  sheet,
  row,
  onSave,
  onClose,
  onSaved,
}: {
  sheet: Sheet;
  row: Row;
  onSave: Props["onSave"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [included, setIncluded] = useState(row.lineId != null);
  const [currentQty, setCurrentQty] = useState(row.currentQty ?? "");
  const [physicalPct, setPhysicalPct] = useState(row.physicalPct ?? "");

  let over = false;
  try {
    over = currentQty.trim() !== "" && compareQty(addDecimal(row.previousQty, currentQty || "0"), row.budgetQty) > 0;
  } catch {
    over = false;
  }

  function handleSave() {
    setError(null);
    try {
      if (included && (currentQty.trim() === "" || compareQty(currentQty, "0") <= 0)) {
        setError("Indicá una cantidad mayor a 0.");
        return;
      }
      if (
        included
        && physicalPct.trim() !== ""
        && (compareQty(physicalPct, "0") < 0 || compareQty(physicalPct, "100") > 0)
      ) {
        setError("El % físico debe estar entre 0 y 100.");
        return;
      }
    } catch {
      setError("Revisá la cantidad y el % físico.");
      return;
    }

    const rows: SaveCertificationMeasurementInput["rows"] = sheet.rows.map((item) => {
      if (item.wbsNodeId === row.wbsNodeId) {
        return {
          wbsNodeId: item.wbsNodeId,
          included,
          currentQty: currentQty.trim(),
          physicalPct: physicalPct.trim(),
        };
      }
      return {
        wbsNodeId: item.wbsNodeId,
        included: item.lineId != null,
        currentQty: item.currentQty ?? "",
        physicalPct: item.physicalPct ?? "",
      };
    });

    startTransition(async () => {
      const result = await onSave({ certificationId: sheet.certificationId, rows });
      if ("error" in result) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(included ? "Partida medida" : "Partida quitada del certificado");
      router.refresh();
      onSaved();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Medir {row.code}</DialogTitle>
        <DialogDescription>
          {row.name}{row.unit ? ` · ${row.unit}` : ""}
          {row.unitSalePrice ? ` · PU venta ${formatUnitPriceFromString(row.unitSalePrice)}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <Ref label="Ppto." value={formatQtyFromString(row.budgetQty)} />
        <Ref label="Previa" value={formatQtyFromString(row.previousQty)} />
        <Ref label="Saldo" value={formatQtyFromString(row.remainingQty)} />
        <Ref
          label="Libro acum."
          value={`${formatQtyFromString(row.logQtyAcum)} · ${formatRatePctWithSymbol(row.logPctAcum)}`}
        />
        <Ref
          label="Libro período"
          value={`${formatQtyFromString(row.logQtyPeriod)} · ${formatRatePctWithSymbol(row.logPctPeriod)}`}
        />
      </div>

      {sheet.costAvailable && row.cost ? (
        <div className="grid grid-cols-2 gap-3 rounded-md border px-3 py-2 text-sm">
          <Ref label="Comprometido" value={formatMoneyAmount(row.cost.committedCost)} />
          <Ref label="Consumido" value={formatMoneyAmount(row.cost.consumedCost)} />
          <Ref label="Mano de obra" value={formatMoneyAmount(row.cost.laborCost)} />
          <Ref label="Equipos" value={formatMoneyAmount(row.cost.equipmentCost)} />
          <Ref label="Subcontratos" value={formatMoneyAmount(row.cost.subcontractCost)} />
          <p className="col-span-2 text-[11px] text-muted-foreground">
            Costo del período en {sheet.currency}. No se copia a la cantidad.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          El costo del período no está disponible.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id={`include-${row.wbsNodeId}`}
          checked={included}
          onCheckedChange={(checked) => setIncluded(checked === true)}
        />
        <Label htmlFor={`include-${row.wbsNodeId}`}>Incluir en este certificado</Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cantidad a certificar</Label>
          <DecimalInput
            scale={4}
            value={currentQty}
            onValueChange={(value) => {
              setCurrentQty(value);
              try {
                if (value.trim() !== "" && compareQty(value, "0") > 0) setIncluded(true);
              } catch {
                /* El input todavía no es un decimal. */
              }
            }}
            aria-label={`Cantidad ${row.code}`}
          />
          {row.suggestedQty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setCurrentQty(row.suggestedQty!);
                setIncluded(true);
              }}
            >
              Usar libro del período
            </Button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>% físico</Label>
          <DecimalInput
            scale={2}
            value={physicalPct}
            onValueChange={setPhysicalPct}
            aria-label={`Porcentaje físico ${row.code}`}
          />
          {row.suggestedPhysicalPct ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPhysicalPct(row.suggestedPhysicalPct!)}
            >
              Aplicar % del libro
            </Button>
          ) : null}
        </div>
      </div>

      {over ? (
        <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          Supera el presupuesto. En obra pública la emisión se bloquea.
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          {pending ? "Guardando..." : included ? "Guardar medición" : "Quitar partida"}
        </Button>
      </div>
    </>
  );
}

function Ref({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
