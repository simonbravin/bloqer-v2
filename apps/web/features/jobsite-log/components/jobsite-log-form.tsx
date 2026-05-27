"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { ListEmptyState } from "@/components/ui/list-empty-state";

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

type Props = {
  projectId:  string;
  companyId:  string;
  wbsOptions: WbsItemOption[];
  contactOptions: ContactOption[];
  productOptions: ProductOption[];
  warehouseOptions: WarehouseOption[];
  subcontractOptions: SubcontractOption[];
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
  action, defaultValues, submitLabel = "Crear parte", mode = "create",
}: Props) {
  const router = useRouter();

  const [progress,  setProgress]  = useState<ProgressLine[]>(defaultValues?.progress  ?? []);
  const [labor,     setLabor]     = useState<LaborLine[]>(defaultValues?.labor     ?? []);
  const [materials, setMaterials] = useState<MaterialLine[]>(defaultValues?.materials ?? []);
  const [issues,    setIssues]    = useState<IssueLine[]>(defaultValues?.issues    ?? []);
  const [error,     setError]     = useState<string | null>(null);
  const [pending,   setPending]   = useState(false);

  function updateProgress(i: number, field: keyof ProgressLine, val: string) {
    setProgress((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function updateLabor(i: number, field: keyof LaborLine, val: string) {
    setLabor((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function updateMaterial(i: number, field: keyof MaterialLine, val: string) {
    setMaterials((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function updateIssue(i: number, field: keyof IssueLine, val: string) {
    setIssues((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("projectId", projectId);
    fd.set("companyId", companyId);

    // Append child arrays as JSON
    fd.set("progress",  JSON.stringify(progress.map((p, i) => ({
      wbsNodeId: p.wbsNodeId === "__none__" ? undefined : p.wbsNodeId,
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
    fd.set("materials", JSON.stringify(materials.map((m, i) => ({
      productId: m.productId === "__none__" ? undefined : m.productId,
      warehouseId: m.warehouseId === "__none__" ? undefined : m.warehouseId,
      description: m.description,
      quantity: m.quantity,
      notes: m.notes || undefined,
      sortOrder: i,
    }))));
    fd.set("issues", JSON.stringify(issues.map((iss, i) => ({
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
        toast.success(mode === "edit" ? "Parte actualizada." : "Parte guardada.");
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

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ── Header ── */}
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
          <TableScroll className="border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partida WBS</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>% Físico</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1">
                      <Select value={row.wbsNodeId} onValueChange={(v) => updateProgress(i, "wbsNodeId", v)}>
                        <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                        <SelectContent>
                          {wbsOptions.map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-36" value={row.description} onChange={(e) => updateProgress(i, "description", e.target.value)} /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-24" value={row.quantityCompleted} onChange={(e) => updateProgress(i, "quantityCompleted", e.target.value)} placeholder="0.00" /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-20" value={row.physicalPct} onChange={(e) => updateProgress(i, "physicalPct", e.target.value)} placeholder="%" /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-36" value={row.notes} onChange={(e) => updateProgress(i, "notes", e.target.value)} /></TableCell>
                    <TableCell className="py-1">
                      <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setProgress((p) => p.filter((_, idx) => idx !== i))}>✕</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
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
          <TableScroll className="border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Subcontrato</TableHead>
                  <TableHead>Descripción cuadrilla</TableHead>
                  <TableHead>Trabajadores</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {labor.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1">
                      <Select value={row.contactId} onValueChange={(v) => updateLabor(i, "contactId", v)}>
                        <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="— ninguno —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— ninguno —</SelectItem>
                          {contactOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1">
                      <Select value={row.subcontractId} onValueChange={(v) => updateLabor(i, "subcontractId", v)}>
                        <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="— ninguno —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— ninguno —</SelectItem>
                          {subcontractOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-36" value={row.crewDescription} onChange={(e) => updateLabor(i, "crewDescription", e.target.value)} /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-20" type="number" min="1" value={row.workersCount} onChange={(e) => updateLabor(i, "workersCount", e.target.value)} /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-20" value={row.hoursWorked} onChange={(e) => updateLabor(i, "hoursWorked", e.target.value)} placeholder="0.00" /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-32" value={row.notes} onChange={(e) => updateLabor(i, "notes", e.target.value)} /></TableCell>
                    <TableCell className="py-1">
                      <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setLabor((p) => p.filter((_, idx) => idx !== i))}>✕</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </section>

      {/* ── Materials ── */}
      <section className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Materiales utilizados</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setMaterials((p) => [...p, { ...DEFAULT_MATERIAL }])}>
            + Agregar fila
          </Button>
        </div>
        {materials.length === 0 ? (
          <ListEmptyState message="Sin registros de materiales." className="p-6" />
        ) : (
          <TableScroll className="border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Descripción *</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1">
                      <Select value={row.productId} onValueChange={(v) => updateMaterial(i, "productId", v)}>
                        <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="— ninguno —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— ninguno —</SelectItem>
                          {productOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1">
                      <Select value={row.warehouseId} onValueChange={(v) => updateMaterial(i, "warehouseId", v)}>
                        <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="— ninguno —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— ninguno —</SelectItem>
                          {warehouseOptions.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-40" value={row.description} onChange={(e) => updateMaterial(i, "description", e.target.value)} required /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-24" value={row.quantity} onChange={(e) => updateMaterial(i, "quantity", e.target.value)} placeholder="0.00" /></TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-32" value={row.notes} onChange={(e) => updateMaterial(i, "notes", e.target.value)} /></TableCell>
                    <TableCell className="py-1">
                      <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setMaterials((p) => p.filter((_, idx) => idx !== i))}>✕</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
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
          <TableScroll className="border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Descripción *</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1">
                      <Select value={row.type} onValueChange={(v) => updateIssue(i, "type", v)}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INCIDENT">Incidente</SelectItem>
                          <SelectItem value="BLOCKER">Bloqueo</SelectItem>
                          <SelectItem value="SAFETY">Seguridad</SelectItem>
                          <SelectItem value="OTHER">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1">
                      <Select value={row.severity} onValueChange={(v) => updateIssue(i, "severity", v)}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">Baja</SelectItem>
                          <SelectItem value="MEDIUM">Media</SelectItem>
                          <SelectItem value="HIGH">Alta</SelectItem>
                          <SelectItem value="CRITICAL">Crítica</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-48" value={row.description} onChange={(e) => updateIssue(i, "description", e.target.value)} required /></TableCell>
                    <TableCell className="py-1">
                      <Select value={row.status} onValueChange={(v) => updateIssue(i, "status", v)}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPEN">Abierto</SelectItem>
                          <SelectItem value="RESOLVED">Resuelto</SelectItem>
                          <SelectItem value="ESCALATED">Escalado</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1"><Input className="h-8 text-xs w-32" value={row.notes} onChange={(e) => updateIssue(i, "notes", e.target.value)} /></TableCell>
                    <TableCell className="py-1">
                      <Button type="button" variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => setIssues((p) => p.filter((_, idx) => idx !== i))}>✕</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : submitLabel}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
