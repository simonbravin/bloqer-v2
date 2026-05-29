"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  ScheduleItemContextDto,
  ScheduleWorkspaceDto,
  ScheduleWorkspaceItemDto,
} from "@bloqer/services";

type ScheduleItemAuditEntryView = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  summary: string;
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableCombobox, toSearchableOptions } from "@/components/ui/searchable-combobox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ScheduleProgressDimensions,
  ScheduleProgressLegend,
} from "./schedule-progress-dimensions";
import {
  addScheduleDependencyAction,
  copyProgressFromPhysicalAction,
  getScheduleItemContextAction,
  listScheduleItemAuditAction,
  removeScheduleDependencyAction,
  updateScheduleItemNameAction,
  updateScheduleItemProgressAction,
  cancelScheduleItemAction,
} from "../actions/schedule-actions";
import { STATUS_LABELS } from "../adapters/schedule-view-types";

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontratos",
  OTHER: "Otros",
};

export function ScheduleItemDrawer({
  projectId,
  workspace,
  item,
  allItems,
  open,
  onOpenChange,
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  item: ScheduleWorkspaceItemDto | null;
  allItems: ScheduleWorkspaceItemDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [audit, setAudit] = useState<ScheduleItemAuditEntryView[]>([]);
  const [context, setContext] = useState<ScheduleItemContextDto | null>(null);
  const [predecessorPick, setPredecessorPick] = useState("");
  const [progressInput, setProgressInput] = useState("");
  const [tab, setTab] = useState<"detail" | "history" | "links">("detail");

  const depCandidates = useMemo(() => {
    if (!item) return [];
    return allItems.filter(
      (i) => i.id !== item.id && !item.predecessorIds.includes(i.id),
    );
  }, [allItems, item]);

  const predecessorOptions = useMemo(
    () => toSearchableOptions(depCandidates.map((c) => ({ id: c.id, label: c.name }))),
    [depCandidates],
  );

  useEffect(() => {
    if (!open || !item) return;
    setProgressInput(item.progressPct);
    startTransition(async () => {
      const [auditRes, ctxRes] = await Promise.all([
        listScheduleItemAuditAction(item.id),
        getScheduleItemContextAction(projectId, item.id),
      ]);
      if ("entries" in auditRes) setAudit(auditRes.entries);
      else setAudit([]);
      if ("context" in ctxRes) setContext(ctxRes.context);
      else setContext(null);
    });
  }, [open, item?.id, projectId]);

  if (!item) return null;

  const m = item.metrics;
  const primaryWbs = item.wbsLinks.find((l) => l.isPrimary) ?? item.wbsLinks[0];
  const predItems = item.predecessorDependencies
    .map((d) => {
      const task = allItems.find((i) => i.id === d.predecessorId);
      return task ? { ...task, dependencyId: d.dependencyId } : null;
    })
    .filter(Boolean) as (ScheduleWorkspaceItemDto & { dependencyId: string })[];
  const succItems = item.successorIds
    .map((id) => allItems.find((i) => i.id === id))
    .filter(Boolean) as ScheduleWorkspaceItemDto[];
  function copyPhysical() {
    const pct = m?.operationalProgressPct;
    if (!pct) {
      toast.error("Sin avance físico en libro de obra para este WBS");
      return;
    }
    startTransition(async () => {
      const res = await copyProgressFromPhysicalAction(projectId, item!.id, Number(pct));
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Avance del cronograma actualizado desde obra");
        router.refresh();
      }
    });
  }

  function saveProgress() {
    const pct = Number(progressInput);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Avance inválido (0–100)");
      return;
    }
    startTransition(async () => {
      const res = await updateScheduleItemProgressAction(projectId, item!.id, { progressPct: pct });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Avance planificado guardado");
        router.refresh();
      }
    });
  }

  function saveName(name: string) {
    startTransition(async () => {
      const res = await updateScheduleItemNameAction(projectId, item!.id, { name });
      if ("error" in res) toast.error(res.error);
      else router.refresh();
    });
  }

  function addDependency() {
    if (!predecessorPick) return;
    startTransition(async () => {
      const res = await addScheduleDependencyAction(projectId, workspace.scheduleId, {
        predecessorId: predecessorPick,
        successorId: item!.id,
      });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Dependencia FS agregada");
        setPredecessorPick("");
        router.refresh();
      }
    });
  }

  function removeDep(dependencyId: string) {
    startTransition(async () => {
      const res = await removeScheduleDependencyAction(projectId, { dependencyId });
      if ("error" in res) toast.error(res.error);
      else router.refresh();
    });
  }

  function cancelItem() {
    if (!confirm("¿Cancelar esta tarea en el cronograma?")) return;
    startTransition(async () => {
      const res = await cancelScheduleItemAction(projectId, item!.id);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Tarea cancelada");
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-8">{item.name}</SheetTitle>
          <SheetDescription>
            {STATUS_LABELS[item.status] ?? item.status}
            {item.daysLate ? ` · Atrasado ${item.daysLate} días` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex gap-1 rounded-lg border p-1">
          {(
            [
              ["detail", "Detalle"],
              ["history", "Historial"],
              ["links", "Integraciones"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={tab === id ? "secondary" : "ghost"}
              className="flex-1 text-xs"
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {tab === "detail" && (
          <div className="space-y-6 text-sm mt-4">
            <section className="space-y-2">
              <h3 className="font-medium">Tres avances (BR-SCH-002)</h3>
              <ScheduleProgressDimensions item={item} />
              <ScheduleProgressLegend />
            </section>

            <section className="space-y-1">
              <h3 className="font-medium">Planificación</h3>
              <p>
                {item.startDate ?? "—"} → {item.endDate ?? "—"}
              </p>
              {item.blockReason && (
                <p className="text-destructive">Bloqueo: {item.blockReason}</p>
              )}
              {workspace.canEdit && (
                <div className="flex gap-2 items-end pt-2">
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs">Avance plan %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={progressInput}
                      onChange={(e) => setProgressInput(e.target.value)}
                    />
                  </div>
                  <Button size="sm" disabled={pending} onClick={saveProgress}>
                    Guardar
                  </Button>
                </div>
              )}
            </section>

            {workspace.canEdit && (
              <section className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    saveName((fd.get("name") as string).trim());
                  }}
                  className="flex gap-2"
                >
                  <Input name="name" defaultValue={item.name} maxLength={500} />
                  <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                    OK
                  </Button>
                </form>
              </section>
            )}

            {m && (
              <section className="space-y-2">
                <h3 className="font-medium">Presupuesto vs real</h3>
                <dl className="grid grid-cols-2 gap-2">
                  <dt className="text-muted-foreground">Presupuestado</dt>
                  <dd className="text-right tabular-nums">{m.budgetTotalCost}</dd>
                  <dt className="text-muted-foreground">Comprometido</dt>
                  <dd className="text-right tabular-nums">{m.committedCost}</dd>
                  <dt className="text-muted-foreground">Certificado ($)</dt>
                  <dd className="text-right tabular-nums">{m.certifiedApproved}</dd>
                </dl>
                <div className="space-y-1 pt-2">
                  {(
                    ["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT", "OTHER"] as const
                  ).map((key) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span>{CATEGORY_LABELS[key]}</span>
                      <span className="tabular-nums">{m.costByCategory[key]}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {primaryWbs && (
              <section>
                <h3 className="font-medium mb-2">WBS enlazado</h3>
                <p className="text-muted-foreground">
                  {primaryWbs.wbsCode} — {primaryWbs.wbsName}
                </p>
                <Button variant="link" className="h-auto p-0" asChild>
                  <Link href={`/proyectos/${projectId}/control-costos/${primaryWbs.wbsNodeId}`}>
                    Ver en control de costos
                  </Link>
                </Button>
              </section>
            )}

            {workspace.canEdit && m?.operationalProgressPct && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={copyPhysical}>
                Copiar avance físico al cronograma (acción explícita)
              </Button>
            )}

            <section className="space-y-2">
              <h3 className="font-medium">Dependencias (FS)</h3>
              {predItems.length === 0 ? (
                <p className="text-muted-foreground text-xs">Sin predecesoras</p>
              ) : (
                <ul className="text-xs space-y-1">
                  {predItems.map((p) => (
                    <li key={p.dependencyId} className="flex justify-between gap-2">
                      <span>{p.name}</span>
                      {workspace.canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          disabled={pending}
                          onClick={() => removeDep(p.dependencyId)}
                        >
                          Quitar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {succItems.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground mt-2">Sucesoras</p>
                  <ul className="text-xs space-y-1">
                    {succItems.map((s) => (
                      <li key={s.id}>{s.name}</li>
                    ))}
                  </ul>
                </>
              )}
              {workspace.canEdit && depCandidates.length > 0 && (
                <div className="flex gap-2 pt-2">
                  <SearchableCombobox
                    className="h-8 flex-1 text-xs"
                    options={predecessorOptions}
                    value={predecessorPick}
                    onValueChange={setPredecessorPick}
                    placeholder="Agregar predecesora…"
                    searchPlaceholder="Buscar tarea…"
                  />
                  <Button size="sm" disabled={pending || !predecessorPick} onClick={addDependency}>
                    +
                  </Button>
                </div>
              )}
            </section>

            {workspace.canEdit && item.status !== "CANCELLED" && (
              <Button size="sm" variant="destructive" disabled={pending} onClick={cancelItem}>
                Cancelar tarea
              </Button>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="mt-4">
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin registros de auditoría aún.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {audit.map((e) => (
                  <li key={e.id} className="border-b pb-2">
                    <p className="font-medium">{e.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.actorName ?? "Sistema"} ·{" "}
                      {new Date(e.createdAt).toLocaleString("es-AR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "links" && (
          <div className="space-y-6 text-sm mt-4">
            <section>
              <h3 className="font-medium mb-2">Libro de obra (aprobados)</h3>
              {!context?.jobsiteEntries.length ? (
                <p className="text-muted-foreground text-xs">Sin partes aprobados en el WBS primario.</p>
              ) : (
                <ul className="space-y-2">
                  {context.jobsiteEntries.map((j) => (
                    <li key={j.jobsiteLogId} className="flex justify-between gap-2">
                      <Link href={j.href} className="text-primary hover:underline">
                        {j.logDate}
                      </Link>
                      <span className="tabular-nums text-muted-foreground">
                        {j.physicalPct != null ? `${j.physicalPct}%` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="font-medium mb-2">Certificaciones</h3>
              {!context?.certificationEntries.length ? (
                <p className="text-muted-foreground text-xs">Sin líneas certificadas en el WBS.</p>
              ) : (
                <ul className="space-y-2">
                  {context.certificationEntries.map((c) => (
                    <li key={c.certificationId} className="flex justify-between gap-2">
                      <Link href={c.href} className="text-primary hover:underline">
                        Cert. #{c.certificationNumber} ({c.status})
                      </Link>
                      <span className="tabular-nums">{c.periodAmount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
