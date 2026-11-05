"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button }   from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { RichNoteEditor, type RichNoteEditorHandle } from "@/components/ui/rich-note-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import {
  CONTACT_PICKER_SEARCH_PLACEHOLDER,
  contactsToSearchableOptions,
  toSearchableOptions,
  withNoneOption,
  wbsToSearchableOptions,
} from "@/lib/searchable-options";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { WbsIncrementalProgressSnapshot } from "@bloqer/services";
import { addDecimal, compareDecimal, formatDateLong, multiplyDecimal, QTY_DECIMALS, roundQty, toIsoDateInTimeZone } from "@bloqer/utils";
import { compareQty, formatQtyDisplay, formatRatePctFromString } from "@/lib/format-money";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import {
  JOBSITE_SHIFT_OPTIONS,
  JOBSITE_WEATHER_OPTIONS,
  isKnownJobsiteShift,
  isKnownJobsiteWeather,
} from "../lib/jobsite-log-options";
import {
  applyProgressPctChange,
  applyProgressQtyChange,
  applyProgressWbsSelection,
  cumulativePhysicalPctFromDrafts,
  JOBSITE_PROGRESS_NONE,
  JOBSITE_QTY_RE,
  prepareMaterialLinesForSubmit,
  prepareProgressLinesForSubmit,
  type JobsiteLogMaterialDraft,
  type JobsiteLogProgressDraft,
} from "../lib/jobsite-log-form-lines";

export type WbsItemOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** CostItem.quantity — techo operativo de la partida. */
  budgetQty?: string;
};
export type ContactOption = { id: string; legalName: string; fantasyName: string | null };
export type ProductOption  = { id: string; name: string; unit: string };
export type WarehouseOption = { id: string; name: string };
export type SubcontractOption = { id: string; code: string; title: string };

type ProgressLine = JobsiteLogProgressDraft & { rowKey: string };
type LaborLine    = { rowKey: string; contactId: string; subcontractId: string; crewDescription: string; workersCount: string; hoursWorked: string; notes: string };
type MaterialLine = JobsiteLogMaterialDraft & { rowKey: string };
type IssueLine    = { rowKey: string; type: string; severity: string; description: string; status: string; notes: string };

function newRowKey(): string {
  return crypto.randomUUID();
}

function withRowKeys<T>(rows: T[]): (T & { rowKey: string })[] {
  return rows.map((row) => ({ ...row, rowKey: newRowKey() }));
}

const DEFAULT_PROGRESS: Omit<ProgressLine, "rowKey"> = { wbsNodeId: JOBSITE_PROGRESS_NONE, description: "", quantityCompleted: "", physicalPct: "", notes: "" };
const DEFAULT_LABOR: Omit<LaborLine, "rowKey">        = { contactId: "__none__", subcontractId: "__none__", crewDescription: "", workersCount: "1", hoursWorked: "", notes: "" };
const DEFAULT_MATERIAL: Omit<MaterialLine, "rowKey">  = { productId: "__none__", warehouseId: "__none__", description: "", quantity: "", notes: "" };
const DEFAULT_ISSUE: Omit<IssueLine, "rowKey">        = { type: "INCIDENT", severity: "MEDIUM", description: "", status: "OPEN", notes: "" };

function useSyncedList<T>(initial: T[]) {
  const [items, setItems] = useState(initial);
  const ref = useRef(items);
  const set = useCallback((updater: T[] | ((prev: T[]) => T[])) => {
    const prev = ref.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    ref.current = next;
    setItems(next);
  }, []);
  return [items, set, ref] as const;
}

/** Drop blank draft rows (defaults are workersCount=1 with no other fields). */
function isMeaningfulLaborLine(l: LaborLine): boolean {
  return (
    l.contactId !== "__none__" ||
    l.subcontractId !== "__none__" ||
    Boolean(l.crewDescription.trim()) ||
    Boolean(l.hoursWorked.trim()) ||
    Boolean(l.notes.trim()) ||
    (Boolean(l.workersCount.trim()) && l.workersCount !== "1")
  );
}

function remainingPctForWbs(
  wbsNodeId: string,
  snapshot: WbsIncrementalProgressSnapshot,
  /** Other draft rows already consuming % for this WBS (exclude the row being edited). */
  draftProgress?: ProgressLine[],
  excludeIndex?: number,
): string {
  if (wbsNodeId === JOBSITE_PROGRESS_NONE) return "";
  let rem = addDecimal("100", multiplyDecimal(approvedPctForWbs(wbsNodeId, snapshot), "-1"));
  if (draftProgress) {
    for (let i = 0; i < draftProgress.length; i++) {
      if (excludeIndex != null && i === excludeIndex) continue;
      const row = draftProgress[i]!;
      if (row.wbsNodeId !== wbsNodeId || !row.physicalPct) continue;
      try {
        rem = addDecimal(rem, multiplyDecimal(row.physicalPct, "-1"));
      } catch {
        /* skip invalid token while typing */
      }
    }
  }
  try {
    if (compareDecimal(rem, "0") < 0) rem = "0";
    return roundQty(rem);
  } catch {
    return rem;
  }
}

function approvedPctForWbs(
  wbsNodeId: string,
  snapshot: WbsIncrementalProgressSnapshot,
): string {
  if (wbsNodeId === JOBSITE_PROGRESS_NONE) return "0";
  return snapshot[wbsNodeId]?.exactApprovedIncrementalPct ?? "0";
}

function cumulativePctLabel(
  wbsNodeId: string,
  progress: ProgressLine[],
  snapshot: WbsIncrementalProgressSnapshot,
): string {
  if (wbsNodeId === JOBSITE_PROGRESS_NONE) return "— / 100";
  const total = cumulativePhysicalPctFromDrafts(
    approvedPctForWbs(wbsNodeId, snapshot),
    progress.filter((row) => row.wbsNodeId === wbsNodeId).map((row) => row.physicalPct),
  );
  return `${formatRatePctFromString(total)} / 100`;
}

type Props = {
  projectId:  string;
  companyId:  string;
  wbsOptions: WbsItemOption[];
  existingWbsOptions?: WbsItemOption[];
  contactOptions: ContactOption[];
  productOptions: ProductOption[];
  warehouseOptions: WarehouseOption[];
  subcontractOptions: SubcontractOption[];
  wbsProgressSnapshot?: WbsIncrementalProgressSnapshot;
  inventoryModuleEnabled?: boolean;
  legacyPhysicalPctWarning?: boolean;
  stockPreviewAction?: (warehouseId: string, productId: string) => Promise<{ balance?: string; error?: string }>;
  action: (fd: FormData) => Promise<{ error: string } | { id: string }>;
  defaultValues?: {
    logDate: string;
    title: string;
    workFront: string;
    shift: string;
    weather: string;
    generalNotes: string;
    progress: JobsiteLogProgressDraft[];
    labor: Omit<LaborLine, "rowKey">[];
    materials: JobsiteLogMaterialDraft[];
    issues: Omit<IssueLine, "rowKey">[];
  };
  submitLabel?: string;
  mode?: "create" | "edit";
  cancelHref?: string;
  extraSections?: (saving: boolean) => ReactNode;
  onCancel?: () => void;
  onSavingChange?: (saving: boolean) => void;
  onSuccess?: (id: string) => void;
  onCreated?: (id: string) => Promise<{ navigate?: boolean; message?: string } | void>;
};

function todayLocalInputDate(): string {
  return toIsoDateInTimeZone();
}

const SELECT_NONE = "__none__";
const SHIFT_CUSTOM = "__custom_shift__";
const WEATHER_CUSTOM = "__custom_weather__";

export function JobsiteLogForm({
  projectId, companyId, wbsOptions, contactOptions, productOptions, warehouseOptions, subcontractOptions,
  existingWbsOptions = [],
  wbsProgressSnapshot = {},
  inventoryModuleEnabled = false,
  legacyPhysicalPctWarning = false,
  stockPreviewAction,
  action, defaultValues, submitLabel = "Crear parte", mode = "create",
  cancelHref = `/proyectos/${projectId}/libro-obra`,
  extraSections,
  onCancel,
  onSavingChange,
  onSuccess,
  onCreated,
}: Props) {
  const router = useRouter();
  const formId = useId();
  const { idempotencyKey } = useIdempotencyKey();
  const generalNotesRef = useRef<RichNoteEditorHandle>(null);

  const [progress,  setProgress, progressRef]  = useSyncedList<ProgressLine>(withRowKeys(defaultValues?.progress  ?? []));
  const [labor,     setLabor, laborRef]        = useSyncedList<LaborLine>(withRowKeys(defaultValues?.labor     ?? []));
  const [materials, setMaterials, materialsRef] = useSyncedList<MaterialLine>(withRowKeys(defaultValues?.materials ?? []));
  const [issues,    setIssues, issuesRef]      = useSyncedList<IssueLine>(withRowKeys(defaultValues?.issues    ?? []));
  const initialLogDate = defaultValues?.logDate ?? (mode === "create" ? todayLocalInputDate() : "");
  const [selectedLogDate, setSelectedLogDate] = useState(initialLogDate);
  const [shift, setShift] = useState(defaultValues?.shift ?? "");
  const [weather, setWeather] = useState(defaultValues?.weather ?? "");
  const [error,     setError]     = useState<string | null>(null);
  const [pending,   setPending]   = useState(false);
  const saving = useRef(false);
  const [stockByKey, setStockByKey] = useState<Record<string, string | null>>({});
  const stockTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const shiftSelectValue = !shift
    ? SELECT_NONE
    : isKnownJobsiteShift(shift)
      ? shift
      : SHIFT_CUSTOM;
  const weatherSelectValue = !weather
    ? SELECT_NONE
    : isKnownJobsiteWeather(weather)
      ? weather
      : WEATHER_CUSTOM;

  const progressWbsOptions = useMemo(
    () => wbsToSearchableOptions(wbsOptions),
    [wbsOptions],
  );
  const materialWbsOptions = useMemo(
    () => withNoneOption(progressWbsOptions, {
      value: JOBSITE_PROGRESS_NONE, label: "Usar la única partida de avance",
    }),
    [progressWbsOptions],
  );
  const contactComboboxOptions = useMemo(
    () =>
      withNoneOption(contactsToSearchableOptions(contactOptions), {
        label: "— ninguno —",
      }),
    [contactOptions],
  );
  const subcontractComboboxOptions = useMemo(
    () =>
      withNoneOption(
        toSearchableOptions(subcontractOptions.map((s) => ({ id: s.id, label: s.code }))),
        { label: "— ninguno —" },
      ),
    [subcontractOptions],
  );
  const productComboboxOptions = useMemo(
    () =>
      withNoneOption(
        toSearchableOptions(productOptions.map((p) => ({ id: p.id, label: p.name }))),
        { label: "— ninguno —" },
      ),
    [productOptions],
  );

  const stockExceededKeys = useMemo(() => {
    const qtyByPair = new Map<string, string>();
    for (const m of materials) {
      if (m.productId === "__none__" || m.warehouseId === "__none__" || !JOBSITE_QTY_RE.test(m.quantity)) continue;
      const key = `${m.productId}:${m.warehouseId}`;
      qtyByPair.set(key, addDecimal(qtyByPair.get(key) ?? "0", m.quantity));
    }
    const exceeded = new Set<string>();
    for (const [key, qty] of qtyByPair) {
      const balance = stockByKey[key];
      if (balance != null && compareQty(qty, balance) > 0) exceeded.add(key);
    }
    return exceeded;
  }, [materials, stockByKey]);

  const fetchStock = useCallback(
    (productId: string, warehouseId: string) => {
      if (!inventoryModuleEnabled || !stockPreviewAction) return;
      if (productId === "__none__" || warehouseId === "__none__") return;
      const key = `${productId}:${warehouseId}`;
      if (stockTimers.current[key]) clearTimeout(stockTimers.current[key]);
      stockTimers.current[key] = setTimeout(async () => {
        const res = await stockPreviewAction(warehouseId, productId).catch(() => null);
        setStockByKey((prev) => ({ ...prev, [key]: res?.balance ?? null }));
      }, 300);
    },
    [inventoryModuleEnabled, stockPreviewAction],
  );

  useEffect(() => {
    const timers = stockTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    for (const m of defaultValues?.materials ?? []) {
      fetchStock(m.productId, m.warehouseId);
    }
  }, [defaultValues?.materials, fetchStock]);

  function updateProgress(i: number, field: keyof ProgressLine, val: string) {
    setProgress((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        if (field === "wbsNodeId") {
          // Prefill remaining % only when the partida actually changes (editable afterwards).
          if (val === r.wbsNodeId) return r;
          const rem = remainingPctForWbs(val, wbsProgressSnapshot, prev, i);
          const wbs = wbsOptions.find((w) => w.id === val);
          return { ...applyProgressWbsSelection(r, wbs, rem), rowKey: r.rowKey };
        }
        const next = { ...r, [field]: val };
        const wbs = wbsOptions.find((w) => w.id === r.wbsNodeId);
        if (field === "physicalPct") {
          return { ...applyProgressPctChange(next, wbs?.budgetQty), rowKey: r.rowKey };
        }
        if (field === "quantityCompleted") {
          return { ...applyProgressQtyChange(next, wbs?.budgetQty), rowKey: r.rowKey };
        }
        return next;
      }),
    );
  }
  function updateLabor(i: number, field: keyof LaborLine, val: string) {
    setLabor((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function updateMaterial(i: number, field: keyof MaterialLine, val: string) {
    setMaterials((prev) => {
      const next = prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
      const row = next[i]!;
      if (field === "productId" || field === "warehouseId") {
        fetchStock(row.productId, row.warehouseId);
      }
      return next;
    });
  }
  function updateIssue(i: number, field: keyof IssueLine, val: string) {
    setIssues((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving.current) return;
    const generalNotesSerialized = generalNotesRef.current?.sync() ?? "";
    const prepared = prepareProgressLinesForSubmit(progressRef.current, wbsOptions);
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }

    const preparedMaterials = prepareMaterialLinesForSubmit(materialsRef.current);
    if ("error" in preparedMaterials) {
      setError(preparedMaterials.error);
      return;
    }
    const laborForSave = laborRef.current.filter(isMeaningfulLaborLine);
    if (laborForSave.some((l) => l.hoursWorked.trim() && !JOBSITE_QTY_RE.test(l.hoursWorked.trim()))) {
      setError("Las horas de mano de obra deben ser un número válido.");
      return;
    }
    const issuesForSave = issuesRef.current.filter((iss) => iss.description.trim() || iss.notes.trim());
    if (issuesForSave.some((iss) => !iss.description.trim())) {
      setError("Cada incidencia necesita descripción.");
      return;
    }

    saving.current = true;
    setPending(true);
    onSavingChange?.(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("generalNotes", generalNotesSerialized);
    fd.set("projectId", projectId);
    fd.set("companyId", companyId);
    if (mode !== "edit") {
      fd.set("idempotencyKey", idempotencyKey);
    }

    fd.set("progress", JSON.stringify(prepared.payload));
    fd.set("labor", JSON.stringify(laborForSave.map((l, i) => ({
      contactId: l.contactId === "__none__" ? undefined : l.contactId,
      subcontractId: l.subcontractId === "__none__" ? undefined : l.subcontractId,
      crewDescription: l.crewDescription || undefined,
      workersCount: parseInt(l.workersCount) || 1,
      hoursWorked: l.hoursWorked || undefined,
      notes: l.notes || undefined,
      sortOrder: i,
    }))));
    fd.set("materials", JSON.stringify(preparedMaterials.payload));
    fd.set("issues", JSON.stringify(issuesForSave.map((iss, i) => ({
      type: iss.type,
      severity: iss.severity,
      description: iss.description,
      status: iss.status,
      notes: iss.notes || undefined,
      sortOrder: i,
    }))));

    try {
      const result = await action(fd);
      if ("error" in result) {
        setError(result.error);
      } else {
        setProgress(
          prepared.filled.map((line, i) => ({
            ...line,
            rowKey: progressRef.current[i]?.rowKey ?? newRowKey(),
          })),
        );
        let created: { navigate?: boolean; message?: string } | void = undefined;
        try {
          created = await onCreated?.(result.id);
        } catch {
          created = {
            message: "Parte creado. Si falta alguna foto, podés adjuntarla desde el detalle.",
          };
        }
        if (created?.message) {
          toast.warning(created.message);
        } else {
          toast.success(mode === "edit" ? "Parte actualizado." : "Parte guardado.");
        }
        if (created?.navigate === false) {
          return;
        }
        onSuccess?.(result.id);
        router.replace(`/proyectos/${projectId}/libro-obra/${result.id}`);
      }
    } catch {
      setError("Error inesperado al guardar el parte.");
    } finally {
      saving.current = false;
      setPending(false);
      onSavingChange?.(false);
    }
  }

  function materialStockLabel(row: MaterialLine): string | null {
    if (!inventoryModuleEnabled || row.productId === "__none__" || row.warehouseId === "__none__") return null;
    const key = `${row.productId}:${row.warehouseId}`;
    const balance = stockByKey[key];
    if (balance === undefined) return "Consultando stock…";
    if (balance === null) return "No se pudo consultar el stock. Se verificará al guardar.";
    const unit = productOptions.find((product) => product.id === row.productId)?.unit;
    return `Disponible: ${formatQtyDisplay(balance)}${unit ? ` ${unit}` : ""}`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" aria-busy={pending}>
      {legacyPhysicalPctWarning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Hay partidas con avance físico acumulado mayor a 100% en datos históricos. Revisá partes aprobados anteriores
          (posible carga acumulada legacy). Ver Q-005b en documentación de producto.
        </div>
      )}
      <section className="form-section space-y-4 p-4 sm:p-5">
        <h2 className="font-semibold">Encabezado</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" placeholder="Ej: Jornada — Frente A" defaultValue={defaultValues?.title} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workFront">Frente de trabajo</Label>
            <Input id="workFront" name="workFront" defaultValue={defaultValues?.workFront} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="logDate">Fecha *</Label>
            <Input
              id="logDate"
              name="logDate"
              type="date"
              required
              max={todayLocalInputDate()}
              className="min-h-11 md:min-h-10"
              defaultValue={initialLogDate}
              onChange={(event) => setSelectedLogDate(event.currentTarget.value)}
              aria-describedby={selectedLogDate ? `${formId}-log-date-label` : undefined}
            />
            {selectedLogDate && (
              <p id={`${formId}-log-date-label`} className="text-xs text-muted-foreground">
                {formatDateLong(selectedLogDate)}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-shift`}>Turno</Label>
            <input type="hidden" name="shift" value={shift} />
            <Select
              value={shiftSelectValue}
              onValueChange={(v) => {
                if (v === SHIFT_CUSTOM) return;
                setShift(v === SELECT_NONE ? "" : v);
              }}
            >
              <SelectTrigger id={`${formId}-shift`} className="min-h-11 md:min-h-10">
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE}>— Sin especificar —</SelectItem>
                {JOBSITE_SHIFT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
                {shift && !isKnownJobsiteShift(shift) ? (
                  <SelectItem value={SHIFT_CUSTOM}>{shift} (actual)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-weather`}>Clima</Label>
            <input type="hidden" name="weather" value={weather} />
            <Select
              value={weatherSelectValue}
              onValueChange={(v) => {
                if (v === WEATHER_CUSTOM) return;
                setWeather(v === SELECT_NONE ? "" : v);
              }}
            >
              <SelectTrigger id={`${formId}-weather`} className="min-h-11 md:min-h-10">
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE}>— Sin especificar —</SelectItem>
                {JOBSITE_WEATHER_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
                {weather && !isKnownJobsiteWeather(weather) ? (
                  <SelectItem value={WEATHER_CUSTOM}>{weather} (actual)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="generalNotes">Notas generales</Label>
          <RichNoteEditor
            ref={generalNotesRef}
            id="generalNotes"
            name="generalNotes"
            defaultValue={defaultValues?.generalNotes}
            disabled={pending}
            aria-label="Notas generales"
            placeholder="Tareas del día, pendientes, problemas…"
          />
          <p className="text-xs text-muted-foreground">
            Viñetas, numeración y negrita. El resto del parte sigue en las tablas de abajo.
          </p>
        </div>
      </section>

      {/* ── Progress ── */}
      <section className="form-section space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Avance de obra</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-8"
            disabled={wbsOptions.length === 0}
            onClick={() => setProgress((p) => [...p, { ...DEFAULT_PROGRESS, rowKey: newRowKey() }])}
          >
            + Agregar fila
          </Button>
        </div>
        {wbsOptions.length === 0 && progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay partidas EDT de un presupuesto aprobado. Sin partida no se puede guardar el avance.
          </p>
        ) : progress.length === 0 ? (
          <ListEmptyState message="Sin registros de avance. Agregá una fila, elegí la partida EDT y la cantidad." className="p-6" />
        ) : (
          <div className="space-y-3">
            {progress.map((row, i) => {
              const historical = existingWbsOptions.find((w) => w.id === row.wbsNodeId);
              const wbs = wbsOptions.find((w) => w.id === row.wbsNodeId) ?? historical;
              const approvedPct = approvedPctForWbs(row.wbsNodeId, wbsProgressSnapshot);
              const remPct = remainingPctForWbs(
                row.wbsNodeId,
                wbsProgressSnapshot,
                progress,
                i,
              );
              const approvedQty = wbsProgressSnapshot[row.wbsNodeId]?.approvedQty;
              return (
              <div key={row.rowKey} className="rounded-md border p-4 space-y-3 shell-surface-inset">
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-wbs-${i}`} className="text-xs">Partida EDT *</Label>
                  <SearchableCombobox
                    id={`${formId}-wbs-${i}`}
                    popoverWidth="wide"
                    className="h-11 min-h-11 w-full text-sm md:h-8 md:min-h-8 md:text-xs"
                    options={historical
                      ? [...progressWbsOptions, ...wbsToSearchableOptions([historical])]
                      : progressWbsOptions}
                    value={row.wbsNodeId}
                    onValueChange={(v) => updateProgress(i, "wbsNodeId", v)}
                    placeholder="Seleccionar…"
                    searchPlaceholder="Buscar partida…"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-progress-description-${i}`} className="text-xs">Descripción</Label>
                  <Input id={`${formId}-progress-description-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.description} onChange={(e) => updateProgress(i, "description", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-progress-qty-${i}`} className="text-xs">
                      Cantidad *{wbs?.unit ? ` (${wbs.unit})` : ""}
                    </Label>
                    <DecimalInput
                      id={`${formId}-progress-qty-${i}`}
                      className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs"
                      value={row.quantityCompleted}
                      onValueChange={(v) => updateProgress(i, "quantityCompleted", v)}
                      placeholder="0,00"
                      scale={QTY_DECIMALS}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-progress-pct-${i}`} className="text-xs">% del día</Label>
                    <DecimalInput
                      id={`${formId}-progress-pct-${i}`}
                      className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs"
                      value={row.physicalPct}
                      onValueChange={(v) => updateProgress(i, "physicalPct", v)}
                      placeholder="0,00"
                      precision={QTY_DECIMALS}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Avance acumulado</p>
                    <div className="flex h-11 min-h-11 items-center rounded-md border bg-muted/40 px-2 text-xs font-mono tabular-nums md:h-8 md:min-h-8">
                      {cumulativePctLabel(row.wbsNodeId, progress, wbsProgressSnapshot)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-progress-notes-${i}`} className="text-xs">Notas</Label>
                    <Input id={`${formId}-progress-notes-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.notes} onChange={(e) => updateProgress(i, "notes", e.target.value)} />
                  </div>
                </div>
                {row.wbsNodeId !== JOBSITE_PROGRESS_NONE ? (
                  <p className="text-[11px] text-muted-foreground">
                    Ya {formatRatePctFromString(approvedPct)}%
                    {approvedQty != null ? ` · Qty aprobada ${formatQtyDisplay(approvedQty)}` : ""}
                    {wbs?.budgetQty
                      ? ` / ppto ${formatQtyDisplay(wbs.budgetQty)}${wbs.unit ? ` ${wbs.unit}` : ""}`
                      : ""}
                    {" · "}
                    Restante sugerido {formatRatePctFromString(remPct)}% (editable)
                    {wbs?.budgetQty
                      ? " · Cambiar % o cantidad mantiene el otro campo alineado al presupuesto"
                      : ""}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setProgress((p) => p.filter((_, idx) => idx !== i))}>Eliminar fila</Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Labor ── */}
      <section className="form-section space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Mano de obra</h2>
          <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={() => setLabor((p) => [...p, { ...DEFAULT_LABOR, rowKey: newRowKey() }])}>
            + Agregar fila
          </Button>
        </div>
        {labor.length === 0 ? (
          <ListEmptyState message="Sin registros de mano de obra." className="p-6" />
        ) : (
          <div className="space-y-3">
            {labor.map((row, i) => (
              <div key={row.rowKey} className="rounded-md border p-4 space-y-3 shell-surface-inset">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-labor-contact-${i}`} className="text-xs">Contacto</Label>
                    <SearchableCombobox
                      id={`${formId}-labor-contact-${i}`}
                      popoverWidth="wide"
                      className="h-11 min-h-11 w-full text-sm md:h-8 md:min-h-8 md:text-xs"
                      options={contactComboboxOptions}
                      value={row.contactId}
                      onValueChange={(v) => updateLabor(i, "contactId", v)}
                      placeholder="— ninguno —"
                      searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-labor-subcontract-${i}`} className="text-xs">Subcontrato</Label>
                    <SearchableCombobox
                      id={`${formId}-labor-subcontract-${i}`}
                      popoverWidth="wide"
                      className="h-11 min-h-11 w-full text-sm md:h-8 md:min-h-8 md:text-xs"
                      options={subcontractComboboxOptions}
                      value={row.subcontractId}
                      onValueChange={(v) => updateLabor(i, "subcontractId", v)}
                      placeholder="— ninguno —"
                      searchPlaceholder="Buscar subcontrato…"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`${formId}-labor-description-${i}`} className="text-xs">Descripción cuadrilla</Label>
                    <Input id={`${formId}-labor-description-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.crewDescription} onChange={(e) => updateLabor(i, "crewDescription", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-labor-workers-${i}`} className="text-xs">Trabajadores</Label>
                    <Input id={`${formId}-labor-workers-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" type="number" min="1" value={row.workersCount} onChange={(e) => updateLabor(i, "workersCount", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-labor-hours-${i}`} className="text-xs">Horas</Label>
                    <DecimalInput id={`${formId}-labor-hours-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.hoursWorked} onValueChange={(v) => updateLabor(i, "hoursWorked", v)} placeholder="0,00" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-labor-notes-${i}`} className="text-xs">Notas</Label>
                  <Input id={`${formId}-labor-notes-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.notes} onChange={(e) => updateLabor(i, "notes", e.target.value)} />
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setLabor((p) => p.filter((_, idx) => idx !== i))}>Eliminar fila</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Materials ── */}
      <section className="form-section space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-semibold">
              {inventoryModuleEnabled
                ? "Materiales utilizados (de inventario disponible)"
                : "Materiales utilizados"}
            </h2>
            {inventoryModuleEnabled ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Al aprobar el parte se registran movimientos de consumo en inventario.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">Sin control de stock (módulo inventario no disponible).</p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={() => setMaterials((p) => [...p, { ...DEFAULT_MATERIAL, rowKey: newRowKey() }])}>
            + Agregar fila
          </Button>
        </div>
        {materials.length === 0 ? (
          <ListEmptyState message="Sin registros de materiales." className="p-6" />
        ) : (
          <div className="space-y-3">
            {materials.map((row, i) => {
              const stockLabel = materialStockLabel(row);
              const productUnit = productOptions.find((product) => product.id === row.productId)?.unit;
              const stockKey = row.productId !== "__none__" && row.warehouseId !== "__none__"
                ? `${row.productId}:${row.warehouseId}` : null;
              const exceedsStock = stockKey && stockExceededKeys.has(stockKey);

              return (
                <div key={row.rowKey} className="rounded-md border p-4 space-y-3 shell-surface-inset">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`${formId}-material-product-${i}`} className="text-xs">Producto</Label>
                      <SearchableCombobox
                        id={`${formId}-material-product-${i}`}
                        popoverWidth="wide"
                        className="h-11 min-h-11 w-full text-sm md:h-8 md:min-h-8 md:text-xs"
                        options={productComboboxOptions}
                        value={row.productId}
                        onValueChange={(v) => updateMaterial(i, "productId", v)}
                        placeholder="— ninguno —"
                        searchPlaceholder="Buscar producto…"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${formId}-material-warehouse-${i}`} className="text-xs">Depósito</Label>
                      <Select value={row.warehouseId} onValueChange={(v) => updateMaterial(i, "warehouseId", v)}>
                        <SelectTrigger id={`${formId}-material-warehouse-${i}`} className="h-11 min-h-11 w-full text-sm md:h-8 md:min-h-8 md:text-xs"><SelectValue placeholder="— ninguno —" /></SelectTrigger>
                        <SelectContent className="min-w-[var(--radix-select-trigger-width)] w-max max-w-[min(28rem,90vw)]">
                          <SelectItem value="__none__">— ninguno —</SelectItem>
                          {warehouseOptions.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {stockLabel && (
                    <p className={`text-xs ${exceedsStock ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {stockLabel}
                      {exceedsStock ? " — el total para este producto y depósito supera el disponible consultado. Se verificará al guardar." : ""}
                    </p>
                  )}
                  {(inventoryModuleEnabled || row.wbsNodeId) && (
                    <div className="space-y-1">
                      <Label htmlFor={`${formId}-material-wbs-${i}`} className="text-xs">Partida EDT del material</Label>
                      <SearchableCombobox
                        id={`${formId}-material-wbs-${i}`}
                        popoverWidth="wide"
                        className="h-11 min-h-11 w-full text-sm md:h-8 md:min-h-8 md:text-xs"
                        options={row.wbsNodeId && row.wbsNodeId !== JOBSITE_PROGRESS_NONE &&
                          !materialWbsOptions.some((option) => option.value === row.wbsNodeId)
                          ? [...materialWbsOptions, { value: row.wbsNodeId, label: "Partida asignada previamente" }]
                          : materialWbsOptions}
                        value={row.wbsNodeId ?? JOBSITE_PROGRESS_NONE}
                        onValueChange={(value) => updateMaterial(i, "wbsNodeId", value)}
                        placeholder="Seleccionar…"
                        searchPlaceholder="Buscar partida…"
                      />
                      <p className="text-xs text-muted-foreground">
                        Si vinculás producto y depósito, elegí una partida o cargá avance en una sola.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`${formId}-material-description-${i}`} className="text-xs">Descripción *</Label>
                      <Input id={`${formId}-material-description-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.description} onChange={(e) => updateMaterial(i, "description", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${formId}-material-qty-${i}`} className="text-xs">
                        Cantidad{productUnit ? ` (${productUnit})` : ""}
                      </Label>
                      <DecimalInput id={`${formId}-material-qty-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.quantity} onValueChange={(v) => updateMaterial(i, "quantity", v)} placeholder="0,00" scale={QTY_DECIMALS} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-material-notes-${i}`} className="text-xs">Notas</Label>
                    <Input id={`${formId}-material-notes-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.notes} onChange={(e) => updateMaterial(i, "notes", e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setMaterials((p) => p.filter((_, idx) => idx !== i))}>Eliminar fila</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {extraSections?.(pending)}

      {/* ── Issues ── */}
      <section className="form-section space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Problemas / Incidencias</h2>
          <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={() => setIssues((p) => [...p, { ...DEFAULT_ISSUE, rowKey: newRowKey() }])}>
            + Agregar fila
          </Button>
        </div>
        {issues.length === 0 ? (
          <ListEmptyState message="Sin incidencias registradas." className="p-6" />
        ) : (
          <div className="space-y-3">
            {issues.map((row, i) => (
              <div key={row.rowKey} className="rounded-md border p-4 space-y-3 shell-surface-inset">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-issue-type-${i}`} className="text-xs">Tipo</Label>
                    <Select value={row.type} onValueChange={(v) => updateIssue(i, "type", v)}>
                      <SelectTrigger id={`${formId}-issue-type-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCIDENT">Incidente</SelectItem>
                        <SelectItem value="BLOCKER">Bloqueo</SelectItem>
                        <SelectItem value="SAFETY">Seguridad</SelectItem>
                        <SelectItem value="OTHER">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-issue-severity-${i}`} className="text-xs">Severidad</Label>
                    <Select value={row.severity} onValueChange={(v) => updateIssue(i, "severity", v)}>
                      <SelectTrigger id={`${formId}-issue-severity-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Baja</SelectItem>
                        <SelectItem value="MEDIUM">Media</SelectItem>
                        <SelectItem value="HIGH">Alta</SelectItem>
                        <SelectItem value="CRITICAL">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-issue-status-${i}`} className="text-xs">Estado</Label>
                    <Select value={row.status} onValueChange={(v) => updateIssue(i, "status", v)}>
                      <SelectTrigger id={`${formId}-issue-status-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">Abierto</SelectItem>
                        <SelectItem value="RESOLVED">Resuelto</SelectItem>
                        <SelectItem value="ESCALATED">Escalado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-issue-description-${i}`} className="text-xs">Descripción *</Label>
                  {/* No HTML required: empty draft rows are dropped on submit (same as materials filter). */}
                  <Input id={`${formId}-issue-description-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.description} onChange={(e) => updateIssue(i, "description", e.target.value)} />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={`${formId}-issue-notes-${i}`} className="text-xs">Notas</Label>
                    <Input id={`${formId}-issue-notes-${i}`} className="h-11 min-h-11 text-sm md:h-8 md:min-h-8 md:text-xs" value={row.notes} onChange={(e) => updateIssue(i, "notes", e.target.value)} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-8 shrink-0 px-2 self-end"
                    onClick={() => setIssues((p) => p.filter((_, idx) => idx !== i))}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <Button
          type="submit"
          className="min-h-11 md:min-h-9"
          disabled={pending}
        >
          {pending ? "Guardando…" : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-9"
          disabled={pending}
          onClick={() => (onCancel ? onCancel() : router.push(cancelHref))}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
