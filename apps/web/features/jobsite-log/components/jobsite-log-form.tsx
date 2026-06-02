"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SearchableCombobox,
  toSearchableOptions,
  withNoneOption,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { WbsIncrementalProgressSnapshot } from "@bloqer/services";

export type WbsItemOption = { id: string; code: string; name: string; unit: string };
export type ContactOption  = { id: string; name: string };
export type ProductOption  = { id: string; name: string };
export type WarehouseOption = { id: string; name: string };
export type SubcontractOption = { id: string; code: string; title: string };

type ProgressLine = { wbsNodeId: string; description: string; quantityCompleted: string; physicalPct: string; notes: string };
type LaborLine    = { contactId: string; subcontractId: string; crewDescription: string; workersCount: string; hoursWorked: string; notes: string };
type MaterialLine = { productId: string; warehouseId: string; description: string; quantity: string; notes: string };
type IssueLine    = { type: string; severity: string; description: string; status: string; notes: string };

const DEFAULT_PROGRESS: ProgressLine  = { wbsNodeId: "__none__", description: "", quantityCompleted: "", physicalPct: "", notes: "" };
const DEFAULT_LABOR: LaborLine        = { contactId: "__none__", subcontractId: "__none__", crewDescription: "", workersCount: "1", hoursWorked: "", notes: "" };
const DEFAULT_MATERIAL: MaterialLine  = { productId: "__none__", warehouseId: "__none__", description: "", quantity: "", notes: "" };
const DEFAULT_ISSUE: IssueLine        = { type: "INCIDENT", severity: "MEDIUM", description: "", status: "OPEN", notes: "" };

const QTY_RE = /^\d+(\.\d+)?$/;

function parseNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function isValidProgressLine(p: ProgressLine): boolean {
  return p.wbsNodeId !== "__none__" && QTY_RE.test(p.quantityCompleted);
}

function cumulativePctLabel(
  wbsNodeId: string,
  progress: ProgressLine[],
  snapshot: WbsIncrementalProgressSnapshot,
): string {
  if (wbsNodeId === "__none__") return "— / 100";
  const approved = parseNum(snapshot[wbsNodeId]?.approvedIncrementalPct ?? "0");
  let draftSum = 0;
  for (const row of progress) {
    if (row.wbsNodeId !== wbsNodeId || !row.physicalPct) continue;
    draftSum += parseNum(row.physicalPct);
  }
  const total = approved + draftSum;
  const formatted = Number.isInteger(total) ? String(total) : total.toFixed(2);
  return `${formatted} / 100`;
}

type Props = {
  projectId:  string;
  companyId:  string;
  wbsOptions: WbsItemOption[];
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
    blockers: string;
    incidents: string;
    safetyNotes: string;
    progress: ProgressLine[];
    labor: LaborLine[];
    materials: MaterialLine[];
    issues: IssueLine[];
  };
  submitLabel?: string;
  mode?: "create" | "edit";
};

export function JobsiteLogForm({
  projectId, companyId, wbsOptions, contactOptions, productOptions, warehouseOptions, subcontractOptions,
  wbsProgressSnapshot = {},
  inventoryModuleEnabled = false,
  legacyPhysicalPctWarning = false,
  stockPreviewAction,
  action, defaultValues, submitLabel = "Crear parte", mode = "create",
}: Props) {
  const router = useRouter();

  const [progress,  setProgress]  = useState<ProgressLine[]>(defaultValues?.progress  ?? []);
  const [labor,     setLabor]     = useState<LaborLine[]>(defaultValues?.labor     ?? []);
  const [materials, setMaterials] = useState<MaterialLine[]>(defaultValues?.materials ?? []);
  const [issues,    setIssues]    = useState<IssueLine[]>(defaultValues?.issues    ?? []);
  const [error,     setError]     = useState<string | null>(null);
  const [pending,   setPending]   = useState(false);
  const [stockByKey, setStockByKey] = useState<Record<string, string>>({});
  const stockTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const progressWbsOptions = useMemo(
    () => wbsToSearchableOptions(wbsOptions),
    [wbsOptions],
  );
  const contactComboboxOptions = useMemo(
    () =>
      withNoneOption(
        toSearchableOptions(contactOptions.map((c) => ({ id: c.id, label: c.name }))),
        { label: "— ninguno —" },
      ),
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

  const stockExceeded = useMemo(() => {
    if (!inventoryModuleEnabled) return false;
    const qtyByPair = new Map<string, number>();
    for (const m of materials) {
      if (m.productId === "__none__" || m.warehouseId === "__none__" || !QTY_RE.test(m.quantity)) continue;
      const key = `${m.productId}:${m.warehouseId}`;
      qtyByPair.set(key, (qtyByPair.get(key) ?? 0) + parseNum(m.quantity));
    }
    for (const [key, qty] of qtyByPair) {
      const balance = stockByKey[key];
      if (balance !== undefined && qty > parseNum(balance)) return true;
    }
    return false;
  }, [materials, stockByKey, inventoryModuleEnabled]);

  const fetchStock = useCallback(
    (productId: string, warehouseId: string) => {
      if (!inventoryModuleEnabled || !stockPreviewAction) return;
      if (productId === "__none__" || warehouseId === "__none__") return;
      const key = `${productId}:${warehouseId}`;
      if (stockTimers.current[key]) clearTimeout(stockTimers.current[key]);
      stockTimers.current[key] = setTimeout(async () => {
        const res = await stockPreviewAction(warehouseId, productId);
        if (res.balance !== undefined) {
          setStockByKey((prev) => ({ ...prev, [key]: res.balance! }));
        }
      }, 300);
    },
    [inventoryModuleEnabled, stockPreviewAction],
  );

  useEffect(() => {
    return () => {
      for (const t of Object.values(stockTimers.current)) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!inventoryModuleEnabled || !stockPreviewAction) return;
    for (const m of defaultValues?.materials ?? []) {
      if (m.productId === "__none__" || m.warehouseId === "__none__") continue;
      const key = `${m.productId}:${m.warehouseId}`;
      void stockPreviewAction(m.warehouseId, m.productId).then((res) => {
        if ("balance" in res && res.balance !== undefined) {
          setStockByKey((prev) => ({ ...prev, [key]: res.balance! }));
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch once for edit defaults
  }, [inventoryModuleEnabled, stockPreviewAction]);

  function updateProgress(i: number, field: keyof ProgressLine, val: string) {
    setProgress((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
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
    if (stockExceeded) {
      setError("Una o más líneas de material superan el stock disponible.");
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("projectId", projectId);
    fd.set("companyId", companyId);

    const validProgress = progress.filter(isValidProgressLine);
    fd.set("progress",  JSON.stringify(validProgress.map((p, i) => ({
      wbsNodeId: p.wbsNodeId,
      description: p.description || undefined,
      quantityCompleted: p.quantityCompleted,
      physicalPct: p.physicalPct || undefined,
      notes: p.notes || undefined,
      sortOrder: i,
    }))));
    fd.set("labor", JSON.stringify(labor.map((l, i) => ({
      contactId: l.contactId === "__none__" ? undefined : l.contactId,
      subcontractId: l.subcontractId === "__none__" ? undefined : l.subcontractId,
      crewDescription: l.crewDescription || undefined,
      workersCount: parseInt(l.workersCount) || 1,
      hoursWorked: l.hoursWorked || undefined,
      notes: l.notes || undefined,
      sortOrder: i,
    }))));
    fd.set("materials", JSON.stringify(materials.filter((m) => m.description.trim() && QTY_RE.test(m.quantity)).map((m, i) => ({
      productId: m.productId === "__none__" ? undefined : m.productId,
      warehouseId: m.warehouseId === "__none__" ? undefined : m.warehouseId,
      description: m.description,
      quantity: m.quantity,
      notes: m.notes || undefined,
      sortOrder: i,
    }))));
    fd.set("issues", JSON.stringify(issues.filter((iss) => iss.description.trim()).map((iss, i) => ({
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
        toast.success(mode === "edit" ? "Parte actualizado." : "Parte guardado.");
        if (mode === "edit") {
          router.push("..");
        } else {
          router.push(`/proyectos/${projectId}/libro-obra/${result.id}`);
        }
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  function materialStockLabel(row: MaterialLine): string | null {
    if (!inventoryModuleEnabled || row.productId === "__none__" || row.warehouseId === "__none__") return null;
    const key = `${row.productId}:${row.warehouseId}`;
    const balance = stockByKey[key];
    if (balance === undefined) return "Consultando stock…";
    return `Disponible: ${balance}`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {legacyPhysicalPctWarning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Hay partidas con avance físico acumulado mayor a 100% en datos históricos. Revisá partes aprobados anteriores
          (posible carga acumulada legacy). Ver Q-005b en documentación de producto.
        </div>
      )}
      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Encabezado</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="logDate">Fecha *</Label>
            <Input id="logDate" name="logDate" type="date" required defaultValue={defaultValues?.logDate} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" placeholder="Ej: Jornada mañana - Frente A" defaultValue={defaultValues?.title} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workFront">Frente de trabajo</Label>
            <Input id="workFront" name="workFront" defaultValue={defaultValues?.workFront} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="shift">Turno</Label>
            <Input id="shift" name="shift" placeholder="Mañana / Tarde / Noche" defaultValue={defaultValues?.shift} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label htmlFor="weather">Clima</Label>
            <Input id="weather" name="weather" placeholder="Soleado, lluvioso…" defaultValue={defaultValues?.weather} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="generalNotes">Notas generales</Label>
          <Textarea id="generalNotes" name="generalNotes" rows={3} defaultValue={defaultValues?.generalNotes} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="blockers">Impedimentos</Label>
            <Textarea id="blockers" name="blockers" rows={2} defaultValue={defaultValues?.blockers} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="incidents">Incidentes</Label>
            <Textarea id="incidents" name="incidents" rows={2} defaultValue={defaultValues?.incidents} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="safetyNotes">Observaciones de seguridad</Label>
          <Textarea id="safetyNotes" name="safetyNotes" rows={2} defaultValue={defaultValues?.safetyNotes} />
        </div>
      </section>

      {/* ── Progress ── */}
      <section className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Avance de obra</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setProgress((p) => [...p, { ...DEFAULT_PROGRESS }])}>
            + Agregar fila
          </Button>
        </div>
        {progress.length === 0 ? (
          <ListEmptyState message="Sin registros de avance." className="p-6" />
        ) : (
          <div className="space-y-3">
            {progress.map((row, i) => (
              <div key={i} className="rounded-md border p-4 space-y-3 bg-muted/20">
                <div className="space-y-1">
                  <Label className="text-xs">Partida WBS</Label>
                  <SearchableCombobox
                    popoverWidth="wide"
                    className="h-8 text-xs w-full"
                    options={progressWbsOptions}
                    value={row.wbsNodeId}
                    onValueChange={(v) => updateProgress(i, "wbsNodeId", v)}
                    placeholder="Seleccionar…"
                    searchPlaceholder="Buscar partida…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción</Label>
                  <Input className="h-8 text-xs" value={row.description} onChange={(e) => updateProgress(i, "description", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Cantidad</Label>
                    <Input className="h-8 text-xs" value={row.quantityCompleted} onChange={(e) => updateProgress(i, "quantityCompleted", e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">% del día</Label>
                    <Input className="h-8 text-xs" value={row.physicalPct} onChange={(e) => updateProgress(i, "physicalPct", e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Avance acumulado</Label>
                    <div className="h-8 flex items-center rounded-md border bg-muted/40 px-2 text-xs font-mono tabular-nums">
                      {cumulativePctLabel(row.wbsNodeId, progress, wbsProgressSnapshot)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notas</Label>
                    <Input className="h-8 text-xs" value={row.notes} onChange={(e) => updateProgress(i, "notes", e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setProgress((p) => p.filter((_, idx) => idx !== i))}>Eliminar fila</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Labor ── */}
      <section className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Mano de obra</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setLabor((p) => [...p, { ...DEFAULT_LABOR }])}>
            + Agregar fila
          </Button>
        </div>
        {labor.length === 0 ? (
          <ListEmptyState message="Sin registros de mano de obra." className="p-6" />
        ) : (
          <div className="space-y-3">
            {labor.map((row, i) => (
              <div key={i} className="rounded-md border p-4 space-y-3 bg-muted/20">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Contacto</Label>
                    <SearchableCombobox
                      popoverWidth="wide"
                      className="h-8 text-xs w-full"
                      options={contactComboboxOptions}
                      value={row.contactId}
                      onValueChange={(v) => updateLabor(i, "contactId", v)}
                      placeholder="— ninguno —"
                      searchPlaceholder="Buscar contacto…"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Subcontrato</Label>
                    <SearchableCombobox
                      popoverWidth="wide"
                      className="h-8 text-xs w-full"
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
                    <Label className="text-xs">Descripción cuadrilla</Label>
                    <Input className="h-8 text-xs" value={row.crewDescription} onChange={(e) => updateLabor(i, "crewDescription", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Trabajadores</Label>
                    <Input className="h-8 text-xs" type="number" min="1" value={row.workersCount} onChange={(e) => updateLabor(i, "workersCount", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Horas</Label>
                    <Input className="h-8 text-xs" value={row.hoursWorked} onChange={(e) => updateLabor(i, "hoursWorked", e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Input className="h-8 text-xs" value={row.notes} onChange={(e) => updateLabor(i, "notes", e.target.value)} />
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
      <section className="rounded-lg border bg-card p-6 space-y-3">
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
          <Button type="button" variant="outline" size="sm" onClick={() => setMaterials((p) => [...p, { ...DEFAULT_MATERIAL }])}>
            + Agregar fila
          </Button>
        </div>
        {materials.length === 0 ? (
          <ListEmptyState message="Sin registros de materiales." className="p-6" />
        ) : (
          <div className="space-y-3">
            {materials.map((row, i) => {
              const stockLabel = materialStockLabel(row);
              const stockKey = row.productId !== "__none__" && row.warehouseId !== "__none__"
                ? `${row.productId}:${row.warehouseId}` : null;
              const exceedsStock = stockKey && stockByKey[stockKey] !== undefined
                && QTY_RE.test(row.quantity)
                && parseNum(row.quantity) > parseNum(stockByKey[stockKey]!);

              return (
                <div key={i} className="rounded-md border p-4 space-y-3 bg-muted/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Producto</Label>
                      <SearchableCombobox
                        popoverWidth="wide"
                        className="h-8 text-xs w-full"
                        options={productComboboxOptions}
                        value={row.productId}
                        onValueChange={(v) => updateMaterial(i, "productId", v)}
                        placeholder="— ninguno —"
                        searchPlaceholder="Buscar producto…"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Depósito</Label>
                      <Select value={row.warehouseId} onValueChange={(v) => updateMaterial(i, "warehouseId", v)}>
                        <SelectTrigger className="h-8 text-xs w-full"><SelectValue placeholder="— ninguno —" /></SelectTrigger>
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
                      {exceedsStock ? " — cantidad supera el disponible" : ""}
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Descripción *</Label>
                      <Input className="h-8 text-xs" value={row.description} onChange={(e) => updateMaterial(i, "description", e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cantidad</Label>
                      <Input className="h-8 text-xs" value={row.quantity} onChange={(e) => updateMaterial(i, "quantity", e.target.value)} placeholder="0.00" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notas</Label>
                    <Input className="h-8 text-xs" value={row.notes} onChange={(e) => updateMaterial(i, "notes", e.target.value)} />
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

      {/* ── Issues ── */}
      <section className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Problemas / Incidencias</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setIssues((p) => [...p, { ...DEFAULT_ISSUE }])}>
            + Agregar fila
          </Button>
        </div>
        {issues.length === 0 ? (
          <ListEmptyState message="Sin incidencias registradas." className="p-6" />
        ) : (
          <div className="space-y-3">
            {issues.map((row, i) => (
              <div key={i} className="rounded-md border p-4 space-y-3 bg-muted/20 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={row.type} onValueChange={(v) => updateIssue(i, "type", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCIDENT">Incidente</SelectItem>
                      <SelectItem value="BLOCKER">Bloqueo</SelectItem>
                      <SelectItem value="SAFETY">Seguridad</SelectItem>
                      <SelectItem value="OTHER">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Severidad</Label>
                  <Select value={row.severity} onValueChange={(v) => updateIssue(i, "severity", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Baja</SelectItem>
                      <SelectItem value="MEDIUM">Media</SelectItem>
                      <SelectItem value="HIGH">Alta</SelectItem>
                      <SelectItem value="CRITICAL">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Descripción *</Label>
                  <Input className="h-8 text-xs" value={row.description} onChange={(e) => updateIssue(i, "description", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select value={row.status} onValueChange={(v) => updateIssue(i, "status", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Abierto</SelectItem>
                      <SelectItem value="RESOLVED">Resuelto</SelectItem>
                      <SelectItem value="ESCALATED">Escalado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-full">
                  <Label className="text-xs">Notas</Label>
                  <Input className="h-8 text-xs" value={row.notes} onChange={(e) => updateIssue(i, "notes", e.target.value)} />
                </div>
                <div className="col-span-full flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setIssues((p) => p.filter((_, idx) => idx !== i))}>Eliminar fila</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || stockExceeded}>{pending ? "Guardando…" : submitLabel}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
