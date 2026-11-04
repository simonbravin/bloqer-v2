"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  parseCostCategoryFilter,
  sliceCostControlByCostType,
  type CostControlFilters,
  type CostControlRow,
  type CostControlTotals,
  type CostTypeBucket,
} from "@bloqer/services/cost-type-slice";
import type { CostCategory } from "@bloqer/database";
import { COST_CATEGORY_OPTIONS } from "@/lib/cost-category-colors";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoneyAmount, formatQtyWithUnit } from "@/lib/format-money";
import { addDecimal, compareDecimal } from "@bloqer/utils";
import { cn } from "@/lib/utils";
import { CostVarianceBadge } from "./cost-variance-badge";
import { WbsItemDrilldownDialog } from "./wbs-item-drilldown-dialog";
import {
  ALL_EDT_COLUMNS,
  columnsForPreset,
  defaultEdtPresetState,
  EDT_COLUMN_LABELS,
  EDT_PRESET_LABELS,
  persistEdtPresetState,
  readEdtPresetState,
  type EdtColumnId,
  type EdtPresetId,
  type EdtPresetState,
} from "../lib/edt-column-presets";

const COLUMN_HINTS: Partial<Record<EdtColumnId, string>> = {
  committed:
    "Compromisos firmes: OC confirmadas y subcontratos activos. Aún no necesariamente facturados.",
  received:
    "Recepción física confirmada (cant. × PU de la OC). Informativo; no suma a la exposición.",
  accrued:
    "Obligación reconocida: facturas de proveedor emitidas y certificaciones de subcontrato aprobadas.",
  paid: "Pagos confirmados imputables a esta partida.",
  consumed:
    "Consumo de inventario (stock OUT CONFIRMED / CONSUMPTION) imputado a la partida. Sin valuación trazable se muestra —. No suma a la exposición esperada.",
  openCommitted:
    "Comprometido abierto = max(0, Comprometido − Devengado ligado al mismo compromiso). Evita doble conteo OC+factura.",
  exposure:
    "Exposición esperada = Devengado + Comprometido abierto (anti doble conteo). No suma OC + factura en bruto.",
  pctPurchased: "Comprometido ÷ presupuesto de costo × 100.",
  pctReceived: "Costo recibido (cant. × PU neto de la OC) ÷ presupuesto de costo × 100. Misma base que % compra: no usa la cantidad presupuestada (en partidas gl eso marcaba 100% al recibir 1).",
  pctPhysicalProgress: "Suma del % del día de partes APPROVED. Si la partida nunca registró %, se usa cantidad ejecutada ÷ cantidad presupuestada.",
  physicalProgress: "Cantidad ejecutada acumulada según partes de libro APPROVED.",
  pctEconomic: "Devengado ÷ presupuesto de costo × 100.",
  pctExposure: "Exposición esperada ÷ presupuesto de costo × 100.",
};

function HintHead({ label, hint }: { label: string; hint?: string }) {
  if (!hint) {
    return <TableHead className="text-right">{label}</TableHead>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TableHead className="text-right cursor-help underline decoration-dotted decoration-muted-foreground/50">
          {label}
        </TableHead>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

function PctPill({ value }: { value: string | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    compareDecimal(value, "105") > 0
      ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
      : compareDecimal(value, "90") >= 0
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums", tone)}>
      {value}%
    </span>
  );
}

type DrilldownFilters = Pick<CostControlFilters, "budgetId" | "dateFrom" | "dateTo">;

type Props = {
  rows: CostControlRow[];
  totals: CostControlTotals;
  currency: string;
  projectId: string;
  filters?: DrilldownFilters;
};

function itemPageHref(projectId: string, wbsNodeId: string, filters?: DrilldownFilters) {
  const sp = new URLSearchParams();
  if (filters?.budgetId) sp.set("budgetId", filters.budgetId);
  if (filters?.dateFrom) sp.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) sp.set("dateTo", filters.dateTo);
  const q = sp.toString();
  return `/proyectos/${projectId}/control-costos/${wbsNodeId}${q ? `?${q}` : ""}`;
}

function isModifiedClick(e: MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

function quantityValue(raw: string | null, unit: string): ReactNode {
  if (raw != null) return formatQtyWithUnit(raw, unit);
  return <span title="Unidades no comparables con la partida; consultá el detalle o el tablero del recurso"><span className="sr-only">Unidades no comparables con la partida; consultá el detalle o el tablero del recurso. </span>—</span>;
}

function consumedCostValue(raw: string | null, currency: string): ReactNode {
  return raw == null
    ? <span title="Sin valuación trazable"><span className="sr-only">Sin valuación. </span>—</span>
    : formatMoneyAmount(raw, currency);
}

function cellValue(row: CostControlRow, col: EdtColumnId, currency: string): ReactNode {
  switch (col) {
    case "budgetCost":
      return formatMoneyAmount(row.budgetTotalCost, currency);
    case "budgetSale":
      return formatMoneyAmount(row.budgetTotalSale, currency);
    case "certified":
      return (
        <>
          {formatMoneyAmount(row.certifiedApproved, currency)}
          {row.flags.overCertified ? <span className="ml-1 text-destructive">!</span> : null}
        </>
      );
    case "committed":
      return formatMoneyAmount(row.committedCost, currency);
    case "received":
      return formatMoneyAmount(row.receivedCost, currency);
    case "accrued":
      return formatMoneyAmount(row.accruedCost, currency);
    case "paid":
      return formatMoneyAmount(row.paidCost, currency);
    case "consumed":
      return consumedCostValue(row.inventoryConsumedCost, currency);
    case "openCommitted":
      return formatMoneyAmount(row.openCommittedCost, currency);
    case "exposure":
      return formatMoneyAmount(row.expectedCostExposure, currency);
    case "variance":
      return (
        <CostVarianceBadge variance={row.costVariance} label={formatMoneyAmount(row.costVariance, currency)} />
      );
    case "physicalProgress":
      return formatQtyWithUnit(row.operationalProgressQty, row.unit);
    case "qtyBudgeted":
      return formatQtyWithUnit(row.budgetQty, row.unit);
    case "qtyCommitted":
      return quantityValue(row.qtyCommitted, row.unit);
    case "qtyReceived":
      return quantityValue(row.qtyReceived, row.unit);
    case "qtyConsumed":
      return quantityValue(row.qtyConsumed, row.unit);
    case "pctPurchased":
      return <PctPill value={row.pctPurchased} />;
    case "pctReceived":
      return <PctPill value={row.pctReceived} />;
    case "pctPhysicalProgress":
      return <PctPill value={row.pctPhysicalProgress} />;
    case "pctEconomic":
      return <PctPill value={row.pctEconomic} />;
    case "pctExposure":
      return <PctPill value={row.pctExposure} />;
    default:
      return null;
  }
}

/** Money columns a cost-type bucket can fill ([D-099]); the rest render as "—". */
const BUCKET_COLUMNS: EdtColumnId[] = [
  "budgetCost",
  "committed",
  "accrued",
  "paid",
  "consumed",
  "openCommitted",
  "exposure",
  "variance",
];

/** Columns that do not make sense when filtering by cost type — hidden when a
 * concrete CostCategory is selected ([D-099]).
 * Rationale: qtyReceived / operationalProgressQty / budgetSale live at the
 * partida level, they can't be sliced by MAT/LAB/EQP/SUB/OTHER. */
const COST_TYPE_FILTER_HIDDEN: EdtColumnId[] = [
  "budgetSale",
  "received",
  "physicalProgress",
  "qtyBudgeted",
  "qtyCommitted",
  "qtyReceived",
  "qtyConsumed",
  "pctReceived",
  "pctPhysicalProgress",
  "certified",
];

type CostTypeFilter = "ALL" | CostCategory;

const COST_TYPE_FILTER_OPTIONS: { value: CostTypeFilter; label: string }[] = [
  { value: "ALL", label: "Todos los tipos" },
  ...COST_CATEGORY_OPTIONS,
];

function bucketCellValue(bucket: CostTypeBucket, col: EdtColumnId, currency: string): ReactNode {
  switch (col) {
    case "budgetCost":
      return formatMoneyAmount(bucket.budgetTotalCost, currency);
    case "committed":
      return formatMoneyAmount(bucket.committedCost, currency);
    case "accrued":
      return formatMoneyAmount(bucket.accruedCost, currency);
    case "paid":
      return formatMoneyAmount(bucket.paidCost, currency);
    case "consumed":
      return consumedCostValue(bucket.inventoryConsumedCost, currency);
    case "openCommitted":
      return formatMoneyAmount(bucket.openCommittedCost, currency);
    case "exposure":
      return formatMoneyAmount(bucket.expectedCostExposure, currency);
    case "variance":
      return formatMoneyAmount(bucket.costVariance, currency);
    default:
      return "—";
  }
}

function sumQtyDisplay(rows: CostControlRow[], pick: (r: CostControlRow) => string | null): string {
  const units = new Set(rows.map((row) => row.unit.trim()));
  if (units.size !== 1 || units.has("")) return "—";
  let total = "0";
  for (const row of rows) {
    const raw = pick(row);
    if (raw == null) return "—";
    try {
      total = addDecimal(total, raw || "0");
    } catch {
      return "—";
    }
  }
  return formatQtyWithUnit(total, rows[0]!.unit);
}

function totalValue(
  totals: CostControlTotals,
  col: EdtColumnId,
  rows: CostControlRow[],
  currency: string,
): ReactNode {
  switch (col) {
    case "budgetCost":
      return formatMoneyAmount(totals.budgetTotalCost, currency);
    case "budgetSale":
      return formatMoneyAmount(totals.budgetTotalSale, currency);
    case "certified":
      return formatMoneyAmount(totals.certifiedApproved, currency);
    case "committed":
      return formatMoneyAmount(totals.committedCost, currency);
    case "received":
      return formatMoneyAmount(totals.receivedCost, currency);
    case "accrued":
      return formatMoneyAmount(totals.accruedCost, currency);
    case "paid":
      return formatMoneyAmount(totals.paidCost, currency);
    case "consumed":
      return consumedCostValue(totals.inventoryConsumedCost, currency);
    case "openCommitted":
      return formatMoneyAmount(totals.openCommittedCost, currency);
    case "exposure":
      return formatMoneyAmount(totals.expectedCostExposure, currency);
    case "variance":
      return formatMoneyAmount(totals.costVariance, currency);
    case "physicalProgress":
      return sumQtyDisplay(rows, (row) => row.operationalProgressQty);
    case "qtyBudgeted":
      return sumQtyDisplay(rows, (r) => r.budgetQty);
    case "qtyCommitted":
      return sumQtyDisplay(rows, (r) => r.qtyCommitted);
    case "qtyReceived":
      return sumQtyDisplay(rows, (r) => r.qtyReceived);
    case "qtyConsumed":
      return sumQtyDisplay(rows, (r) => r.qtyConsumed);
    default:
      // % columns: footer blank (sum of % is meaningless)
      return null;
  }
}

function EdtRowCard({
  row,
  currency,
  columns,
  projectId,
  filters,
  onOpen,
  typeExpanded,
  onToggleType,
  typeExpandAvailable,
}: {
  row: CostControlRow;
  currency: string;
  columns: EdtColumnId[];
  projectId: string;
  filters?: DrilldownFilters;
  onOpen: (row: CostControlRow) => void;
  typeExpanded: boolean;
  onToggleType: (wbsNodeId: string, e: MouseEvent) => void;
  typeExpandAvailable: boolean;
}) {
  const href = itemPageHref(projectId, row.wbsNodeId, filters);
  const buckets = row.byCostType ?? [];
  const canExpand = typeExpandAvailable && buckets.length > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={cn(
        "w-full cursor-pointer rounded-lg border bg-card p-3 text-left space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        row.flags.overBudget && "border-red-300 dark:border-red-800",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-1">
          {canExpand ? (
            <button
              type="button"
              className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-label={typeExpanded ? "Ocultar tipos de costo" : "Ver tipos de costo"}
              aria-expanded={typeExpanded}
              onClick={(e) => onToggleType(row.wbsNodeId, e)}
            >
              {typeExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
          <div className="min-w-0">
            <Link
              href={href}
              className="font-mono text-xs font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.wbsCode}
            </Link>
            <p className="truncate text-sm font-medium">{row.wbsName}</p>
          </div>
        </div>
        <CostVarianceBadge
          variance={row.costVariance}
          label={formatMoneyAmount(row.costVariance, currency)}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {columns.slice(0, 8).map((col) => (
          <div key={col} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{EDT_COLUMN_LABELS[col]}</dt>
            <dd className="tabular-nums text-right">{cellValue(row, col, currency)}</dd>
          </div>
        ))}
      </dl>
      {canExpand && typeExpanded ? (
        <div className="border-t pt-2 space-y-1.5">
          <p className="text-[10px] text-muted-foreground">
            Presupuesto → exposición por tipo
          </p>
          <ul className="space-y-1 text-[10px] text-muted-foreground">
            {buckets.map((b) => (
              <li key={b.costType} className="flex justify-between gap-2">
                <span className="font-medium text-foreground/80">{b.label}</span>
                <span className="tabular-nums shrink-0">
                  {formatMoneyAmount(b.budgetTotalCost, currency)} → {formatMoneyAmount(b.expectedCostExposure, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function CostControlTable({ rows, totals, currency, projectId, filters = {} }: Props) {
  const [openItem, setOpenItem] = useState<CostControlRow | null>(null);
  const [presetState, setPresetState] = useState<EdtPresetState>(defaultEdtPresetState);
  const [hydrated, setHydrated] = useState(false);
  const [typeExpanded, setTypeExpanded] = useState<Set<string>>(() => new Set());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlCostType = parseCostCategoryFilter(searchParams.get("costType")) ?? "ALL";
  const [costTypeFilter, setCostTypeFilterState] = useState<CostTypeFilter>(urlCostType);

  // URL is the source of truth (Limpiar / cambiar presupuesto / back). Local
  // state is only an optimistic write so the select does not flicker.
  useEffect(() => {
    setCostTypeFilterState(urlCostType);
  }, [urlCostType]);

  function setCostTypeFilter(next: CostTypeFilter) {
    setCostTypeFilterState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "ALL") {
      params.delete("costType");
    } else {
      params.set("costType", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    setPresetState(readEdtPresetState(projectId));
    setHydrated(true);
  }, [projectId]);

  function updatePreset(next: EdtPresetState) {
    setPresetState(next);
    persistEdtPresetState(projectId, next);
  }

  function toggleTypeExpand(wbsNodeId: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTypeExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(wbsNodeId)) next.delete(wbsNodeId);
      else next.add(wbsNodeId);
      return next;
    });
  }

  const columnsRaw = columnsForPreset(presetState);
  const filterActive = costTypeFilter !== "ALL";
  const columns = filterActive
    ? columnsRaw.filter((col) => !COST_TYPE_FILTER_HIDDEN.includes(col))
    : columnsRaw;
  // Quantity / % presets have no money column, so a bucket row would be all dashes.
  const typeExpandAvailable = !filterActive && columns.some((col) => BUCKET_COLUMNS.includes(col));

  const sliced =
    costTypeFilter === "ALL" ? null : sliceCostControlByCostType(rows, costTypeFilter);
  const derivedRows = sliced?.rows ?? rows;
  const derivedTotals = sliced?.totals ?? totals;
  const filterLabel = COST_TYPE_FILTER_OPTIONS.find((o) => o.value === costTypeFilter)?.label ?? "";

  function openFromList(e: MouseEvent, row: CostControlRow) {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setOpenItem(row);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <div className="space-y-1">
            <Label htmlFor="cost-columns-preset" className="text-xs">Vista de columnas</Label>
            <Select
              value={presetState.preset}
              onValueChange={(v) => {
                const preset = v as EdtPresetId;
                updatePreset({
                  ...presetState,
                  preset,
                  customColumns:
                    preset === "custom"
                      ? presetState.customColumns
                      : columnsForPreset({ ...presetState, preset }),
                });
              }}
            >
              <SelectTrigger id="cost-columns-preset" className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EDT_PRESET_LABELS) as EdtPresetId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {EDT_PRESET_LABELS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {presetState.preset === "custom" && hydrated ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-w-3xl">
              {ALL_EDT_COLUMNS.map((col) => {
                const checked = presetState.customColumns.includes(col);
                return (
                  <label key={col} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v
                          ? [...presetState.customColumns, col]
                          : presetState.customColumns.filter((c) => c !== col);
                        updatePreset({ preset: "custom", customColumns: next });
                      }}
                    />
                    {EDT_COLUMN_LABELS[col]}
                  </label>
                );
              })}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="cost-type-filter" className="text-xs">Tipo de costo</Label>
            <Select
              value={costTypeFilter}
              onValueChange={(v) => setCostTypeFilter(v as CostTypeFilter)}
            >
              <SelectTrigger id="cost-type-filter" className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COST_TYPE_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!hydrated ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                updatePreset(defaultEdtPresetState());
                if (costTypeFilter !== "ALL") setCostTypeFilter("ALL");
              }}
            >
              Restablecer
            </Button>
          )}
        </div>
        {filterActive ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Filtrando por <span className="font-medium text-foreground">{filterLabel}</span>. Los importes
            corresponden a ese tipo de costo. Las columnas de cantidad, % recepción y avance de obra se ocultan
            porque son atributos de la partida, no del bucket.
          </div>
        ) : null}

        {/* Mobile cards */}
        <div className="grid gap-2 md:hidden">
          {derivedRows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Ninguna partida tiene actividad en {filterLabel.toLowerCase()}.
            </p>
          ) : (
            derivedRows.map((row) => (
              <EdtRowCard
                key={row.wbsNodeId}
                row={row}
                currency={currency}
                columns={columns}
                projectId={projectId}
                filters={filters}
                onOpen={setOpenItem}
                typeExpanded={typeExpanded.has(row.wbsNodeId)}
                onToggleType={toggleTypeExpand}
                typeExpandAvailable={typeExpandAvailable}
              />
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <TableScroll stickyFirstColumn>
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/50">
                <TableRow>
                  <TableHead className="w-28">EDT</TableHead>
                  <TableHead>Ítem</TableHead>
                  {columns.map((col) => (
                    <HintHead
                      key={col}
                      label={EDT_COLUMN_LABELS[col]}
                      hint={COLUMN_HINTS[col]}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {derivedRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={2 + columns.length}
                      className="text-center text-xs text-muted-foreground py-6"
                    >
                      Ninguna partida tiene actividad en {filterLabel.toLowerCase()}.
                    </TableCell>
                  </TableRow>
                ) : null}
                {derivedRows.flatMap((row) => {
                  const buckets = row.byCostType ?? [];
                  const canExpand = typeExpandAvailable && buckets.length > 0;
                  const expanded = canExpand && typeExpanded.has(row.wbsNodeId);
                  const main = (
                    <TableRow
                      key={row.wbsNodeId}
                      className={cn(
                        "cursor-pointer",
                        row.flags.overBudget && "bg-red-50/50 dark:bg-red-950/10",
                      )}
                      onClick={(e) => {
                        if (isModifiedClick(e)) return;
                        setOpenItem(row);
                      }}
                    >
                      <TableCell className="font-mono font-medium">
                        <div className="flex items-center gap-0.5">
                          {canExpand ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                              aria-label={expanded ? "Ocultar tipos de costo" : "Ver tipos de costo"}
                              aria-expanded={expanded}
                              onClick={(e) => toggleTypeExpand(row.wbsNodeId, e)}
                            >
                              {expanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block w-4" />
                          )}
                          <Link
                            href={itemPageHref(projectId, row.wbsNodeId, filters)}
                            className="hover:underline text-primary"
                            onClick={(e) => openFromList(e, row)}
                          >
                            {row.wbsCode}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        <Link
                          href={itemPageHref(projectId, row.wbsNodeId, filters)}
                          className="hover:underline"
                          onClick={(e) => openFromList(e, row)}
                        >
                          {row.wbsName}
                        </Link>
                        {row.flags.missingBudget && (
                          <span className="ml-1 text-yellow-600 text-xs">(sin análisis)</span>
                        )}
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell
                          key={col}
                          className={cn(
                            "text-right",
                            col === "exposure" && "font-medium",
                            [
                              "committed",
                              "received",
                              "accrued",
                              "paid",
                              "consumed",
                              "openCommitted",
                              "budgetSale",
                              "physicalProgress",
                            ].includes(col) && "text-muted-foreground",
                          )}
                        >
                          {cellValue(row, col, currency)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                  if (!expanded) return [main];
                  return [
                    main,
                    ...buckets.map((b) => (
                      <TableRow
                        key={`${row.wbsNodeId}-${b.costType}`}
                        className="bg-muted/30 text-muted-foreground"
                      >
                        <TableCell className="pl-8 text-[10px] text-muted-foreground/70">
                          └
                        </TableCell>
                        <TableCell className="text-xs pl-2 font-medium text-foreground/80">
                          {b.label}
                        </TableCell>
                        {columns.map((col) => (
                          <TableCell key={col} className="text-right tabular-nums text-[11px]">
                            {bucketCellValue(b, col, currency)}
                          </TableCell>
                        ))}
                      </TableRow>
                    )),
                  ];
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={2}>
                    Total{filterActive ? ` · ${filterLabel}` : ""}
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={col} className="text-right" title={col.startsWith("qty") || col === "physicalProgress" ? "Solo se suman cantidades comparables de una misma unidad." : undefined}>
                      {totalValue(derivedTotals, col, derivedRows, currency)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            </Table>
          </TableScroll>
        </div>
      </div>

      <WbsItemDrilldownDialog
        open={openItem !== null}
        onOpenChange={(next) => {
          if (!next) setOpenItem(null);
        }}
        projectId={projectId}
        wbsNodeId={openItem?.wbsNodeId ?? null}
        wbsCode={openItem?.wbsCode ?? ""}
        wbsName={openItem?.wbsName ?? ""}
        filters={filters}
      />
    </TooltipProvider>
  );
}
