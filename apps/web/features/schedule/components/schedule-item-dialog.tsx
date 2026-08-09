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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ScheduleProgressDimensions,
  ScheduleProgressLegend,
} from "./schedule-progress-dimensions";
import {
  addScheduleDependencyAction,
  copyProgressFromPhysicalAction,
  getScheduleItemContextAction,
  linkWbsNodesToScheduleItemAction,
  listScheduleItemAuditAction,
  removeScheduleDependencyAction,
  unlinkWbsNodeFromScheduleItemAction,
  updateScheduleItemDatesAction,
  updateScheduleItemNameAction,
  updateScheduleItemProgressAction,
  cancelScheduleItemAction,
} from "../actions/schedule-actions";
import { STATUS_LABELS, primaryWbsLink, scheduleItemHasActiveChildren } from "../adapters/schedule-view-types";
import { formatDateAr } from "@/lib/gantt-date-format";
import { formatMoneyAmount } from "@/lib/format-money";
import { ScheduleCancelDialog } from "./schedule-cancel-dialog";
import { ScheduleWbsPicker } from "./schedule-wbs-picker";
import { ScheduleMissingEdtBadge } from "./schedule-missing-edt-badge";

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontratos",
  OTHER: "Otros",
};

export type ScheduleItemDialogTab = "detail" | "deps" | "history" | "links";

export function ScheduleItemDialog({
  projectId,
  workspace,
  itemId,
  allItems,
  open,
  onOpenChange,
  initialTab = "detail",
}: {
  projectId: string;
  workspace: ScheduleWorkspaceDto;
  itemId: string | null;
  allItems: ScheduleWorkspaceItemDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: ScheduleItemDialogTab;
}) {
  const router = useRouter();
  const item = itemId ? allItems.find((i) => i.id === itemId) ?? null : null;
  const isContainer = item ? scheduleItemHasActiveChildren(allItems, item.id) : false;
  const [pending, startTransition] = useTransition();
  const [audit, setAudit] = useState<ScheduleItemAuditEntryView[]>([]);
  const [context, setContext] = useState<ScheduleItemContextDto | null>(null);
  const [predecessorPick, setPredecessorPick] = useState("");
  const [wbsPick, setWbsPick] = useState("");
  const [progressInput, setProgressInput] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [tab, setTab] = useState<ScheduleItemDialogTab>(initialTab);
  const [cancelOpen, setCancelOpen] = useState(false);

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
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab, itemId]);

  const wbsLinksKey =
    item?.wbsLinks.map((l) => `${l.wbsNodeId}:${l.isPrimary ? "1" : "0"}`).join("|") ?? "";

  useEffect(() => {
    if (!open || !item) return;
    setProgressInput(item.progressPct);
    setStartDateInput(item.startDate ?? "");
    setEndDateInput(item.endDate ?? "");
    setWbsPick("");
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
  }, [
    open,
    item?.id,
    item?.progressPct,
    item?.startDate,
    item?.endDate,
    wbsLinksKey,
    projectId,
  ]);

  const m = item?.metrics;
  const primaryWbs = item ? primaryWbsLink(item) : null;
  const linkedIds = item?.wbsLinks.map((l) => l.wbsNodeId) ?? [];
  const predItems = (item?.predecessorDependencies ?? [])
    .map((d) => {
      const task = allItems.find((i) => i.id === d.predecessorId);
      return task ? { ...task, dependencyId: d.dependencyId } : null;
    })
    .filter(Boolean) as (ScheduleWorkspaceItemDto & { dependencyId: string })[];
  const succItems = (item?.successorIds ?? [])
    .map((id) => allItems.find((i) => i.id === id))
    .filter(Boolean) as ScheduleWorkspaceItemDto[];

  function copyPhysical() {
    const pct = m?.operationalProgressPct;
    if (!pct) {
      toast.error("Sin avance operativo (cantidad) para esta partida EDT");
      return;
    }
    startTransition(async () => {
      const res = await copyProgressFromPhysicalAction(projectId, item!.id, Number(pct));
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Avance real actualizado (por cantidad operativa)");
        router.refresh();
      }
    });
  }

  function copyJobsitePhysicalPct() {
    const pct = context?.jobsitePhysicalPctCumulative;
    if (!pct) {
      toast.error("Sin % físico acumulado en libro de obra para esta partida EDT");
      return;
    }
    startTransition(async () => {
      const res = await copyProgressFromPhysicalAction(projectId, item!.id, Number(pct));
      if ("error" in res) toast.error(res.error);
      else {
        toast.success(`Cronograma actualizado al ${pct}% (libro de obra)`);
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
        toast.success("Avance real guardado");
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

  function linkWbs() {
    if (!wbsPick || !item) return;
    const nextIds = [...new Set([...linkedIds, wbsPick])];
    startTransition(async () => {
      const res = await linkWbsNodesToScheduleItemAction(projectId, item.id, {
        wbsNodeIds: nextIds,
        primaryWbsNodeId: wbsPick,
      });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Partida EDT vinculada (primaria)");
        setWbsPick("");
        router.refresh();
      }
    });
  }

  function unlinkWbs(wbsNodeId: string) {
    if (!item) return;
    startTransition(async () => {
      const res = await unlinkWbsNodeFromScheduleItemAction(projectId, item.id, { wbsNodeId });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Vínculo EDT eliminado");
        router.refresh();
      }
    });
  }

  function setPrimaryWbs(wbsNodeId: string) {
    if (!item || linkedIds.length === 0) return;
    startTransition(async () => {
      const res = await linkWbsNodesToScheduleItemAction(projectId, item.id, {
        wbsNodeIds: linkedIds,
        primaryWbsNodeId: wbsNodeId,
      });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Partida primaria actualizada");
        router.refresh();
      }
    });
  }

  function confirmCancelItem() {
    startTransition(async () => {
      const res = await cancelScheduleItemAction(projectId, item!.id);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Tarea cancelada");
        setCancelOpen(false);
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  function saveDates() {
    if (!item) return;
    startTransition(async () => {
      const res = await updateScheduleItemDatesAction(projectId, item.id, {
        startDate: startDateInput || null,
        endDate: endDateInput || null,
      });
      if ("error" in res) toast.error(res.error);
      else {
        if ("fsWarnings" in res && res.fsWarnings?.length) {
          toast.warning(res.fsWarnings.join(" "));
        } else {
          toast.success("Fechas actualizadas");
        }
        router.refresh();
      }
    });
  }

  const money = (raw: string | undefined | null) =>
    raw != null && raw !== ""
      ? formatMoneyAmount(raw, workspace.budgetCurrency)
      : "—";

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{item?.name ?? "Tarea"}</span>
            {item ? <ScheduleMissingEdtBadge item={item} allItems={allItems} /> : null}
          </DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                {STATUS_LABELS[item.status] ?? item.status}
                {item.daysLate ? ` · Atrasado ${item.daysLate} días` : ""}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex gap-1 rounded-lg border p-1">
          {(
            [
              ["detail", "Detalle"],
              ["deps", "Dependencias"],
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

        {!item ? (
          <p className="mt-4 text-sm text-muted-foreground">Tarea no encontrada.</p>
        ) : null}

        {item && tab === "detail" && (
          <div className="space-y-6 text-sm mt-4">
            <section className="space-y-2">
              <h3 className="font-medium">Cuatro dimensiones de avance (BR-SCH-002 / D-045)</h3>
              <ScheduleProgressDimensions item={item} />
              <ScheduleProgressLegend />
              <p className="text-xs text-muted-foreground">
                Solo <strong className="font-medium text-foreground">Real</strong> se edita o
                sincroniza desde el libro. Plan (t), Cant. y Cert. son de solo lectura.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-medium">Planificación</h3>
              {workspace.canEdit && !isContainer ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Inicio</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={startDateInput}
                      onChange={(e) => setStartDateInput(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fin</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={endDateInput}
                      onChange={(e) => setEndDateInput(e.target.value)}
                    />
                  </div>
                  <Button size="sm" className="col-span-2" disabled={pending} onClick={saveDates}>
                    Guardar fechas
                  </Button>
                </div>
              ) : (
                <div>
                  <p>
                    {formatDateAr(item.startDate)} → {formatDateAr(item.endDate)}
                  </p>
                  {isContainer && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Fechas de contenedor calculadas automáticamente desde las subtareas.
                    </p>
                  )}
                </div>
              )}
              {item.blockReason && (
                <p className="text-destructive">Bloqueo: {item.blockReason}</p>
              )}
              {workspace.canEdit && !isContainer && (
                <div className="flex gap-2 items-end pt-2">
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs">Avance real %</Label>
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
              {isContainer && (
                <p className="text-xs text-muted-foreground pt-1">
                  El avance real se registra en las subtareas hoja (no en contenedores).
                </p>
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

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">EDT enlazado</h3>
                <ScheduleMissingEdtBadge item={item} allItems={allItems} />
              </div>
              <p className="text-xs text-muted-foreground">
                La partida <strong className="font-medium text-foreground">primaria</strong>{" "}
                sincroniza el avance Real al aprobar el libro y alimenta costos/certificados.
              </p>
              {item.wbsLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin partidas vinculadas.</p>
              ) : (
                <ul className="space-y-2">
                  {item.wbsLinks.map((link) => (
                    <li
                      key={link.wbsNodeId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate">
                          {link.wbsCode} — {link.wbsName}
                          {link.isPrimary ? (
                            <span className="ml-1 text-[10px] text-primary">(primaria)</span>
                          ) : null}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-0.5">
                          <Button variant="link" className="h-auto p-0 text-xs" asChild>
                            <Link href={`/proyectos/${projectId}/control-costos/${link.wbsNodeId}`}>
                              EDT y costos
                            </Link>
                          </Button>
                          <Button variant="link" className="h-auto p-0 text-xs" asChild>
                            <Link
                              href={`/proyectos/${projectId}/libro-obra?wbsNodeId=${link.wbsNodeId}`}
                            >
                              Libro de obra
                            </Link>
                          </Button>
                        </div>
                      </div>
                      {workspace.canEdit && (
                        <div className="flex shrink-0 gap-1">
                          {!link.isPrimary && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs"
                              disabled={pending}
                              onClick={() => setPrimaryWbs(link.wbsNodeId)}
                            >
                              Primaria
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={pending}
                            onClick={() => unlinkWbs(link.wbsNodeId)}
                          >
                            Quitar
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {workspace.canEdit && !isContainer && (
                <div className="flex gap-2 items-end pt-1">
                  <div className="flex-1">
                    <ScheduleWbsPicker
                      projectId={projectId}
                      value={wbsPick}
                      onValueChange={setWbsPick}
                      disabled={pending}
                      label="Vincular partida"
                      excludeIds={linkedIds}
                    />
                  </div>
                  <Button size="sm" disabled={pending || !wbsPick} onClick={linkWbs}>
                    Vincular
                  </Button>
                </div>
              )}
            </section>

            {m && (
              <section className="space-y-2">
                <h3 className="font-medium">Presupuesto vs real</h3>
                <p className="text-xs text-muted-foreground">
                  Comprometido refleja OC confirmadas y subcontratos (solo lectura). Certificado ($)
                  proviene de certificaciones emitidas.
                </p>
                <dl className="grid grid-cols-2 gap-2">
                  <dt className="text-muted-foreground">Presupuestado</dt>
                  <dd className="text-right tabular-nums">{money(m.budgetTotalCost)}</dd>
                  <dt className="text-muted-foreground">Comprometido</dt>
                  <dd className="text-right tabular-nums">{money(m.committedCost)}</dd>
                  <dt className="text-muted-foreground">Devengado</dt>
                  <dd className="text-right tabular-nums">{money(m.accruedCost)}</dd>
                  <dt className="text-muted-foreground">Pagado</dt>
                  <dd className="text-right tabular-nums">{money(m.paidCost)}</dd>
                  <dt className="text-muted-foreground">Certificado ($)</dt>
                  <dd className="text-right tabular-nums">{money(m.certifiedApproved)}</dd>
                </dl>
                <div className="space-y-1 pt-2">
                  {(
                    ["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT", "OTHER"] as const
                  ).map((key) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span>{CATEGORY_LABELS[key]}</span>
                      <span className="tabular-nums">{money(m.costByCategory[key])}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {workspace.canEdit && !isContainer && m?.operationalProgressPct && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={copyPhysical}>
                Copiar avance por cantidad (operativo)
              </Button>
            )}

            {workspace.canEdit && !isContainer && context?.jobsitePhysicalPctCumulative && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={copyJobsitePhysicalPct}>
                Copiar % físico acumulado ({context.jobsitePhysicalPctCumulative}%)
              </Button>
            )}

            {workspace.canEdit &&
              item.status !== "CANCELLED" &&
              item.status !== "COMPLETED" && (
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => setCancelOpen(true)}
              >
                Cancelar tarea
              </Button>
            )}
          </div>
        )}

        {item && tab === "deps" && (
          <div className="space-y-4 text-sm mt-4">
            <section className="space-y-2">
              <h3 className="font-medium">Dependencias Finish-to-Start (FS)</h3>
              <p className="text-xs text-muted-foreground">
                Las violaciones FS se guardan con advertencia (no bloquean). Editá vínculos acá; en
                el Gantt las flechas son de solo lectura.
              </p>
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
          </div>
        )}

        {item && tab === "history" && (
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

        {item && tab === "links" && (
          <div className="space-y-6 text-sm mt-4">
            <section>
              <h3 className="font-medium mb-2">Libro de obra (aprobados)</h3>
              <p className="text-xs text-muted-foreground mb-2">
                % del día por parte. Acumulado aprobado:{" "}
                {context?.jobsitePhysicalPctCumulative != null
                  ? `${context.jobsitePhysicalPctCumulative} / 100`
                  : "—"}
                . El avance operativo del cronograma también puede usar cantidades.
              </p>
              {!context?.jobsiteEntries.length ? (
                <p className="text-muted-foreground text-xs">Sin partes aprobados en la partida EDT primaria.</p>
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
              <h3 className="font-medium mb-2">Certificaciones (solo lectura)</h3>
              <p className="text-xs text-muted-foreground mb-2">
                No actualizan el avance Real del cronograma (BR-SCH-002).
              </p>
              {!context?.certificationEntries.length ? (
                <p className="text-muted-foreground text-xs">Sin líneas certificadas en la partida EDT.</p>
              ) : (
                <ul className="space-y-2">
                  {context.certificationEntries.map((c) => (
                    <li key={c.certificationId} className="flex justify-between gap-2">
                      <Link href={c.href} className="text-primary hover:underline">
                        Cert. #{c.certificationNumber} ({c.status})
                      </Link>
                      <span className="tabular-nums">{money(c.periodAmount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {item && (
      <ScheduleCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        itemName={item.name}
        pending={pending}
        onConfirm={confirmCancelItem}
      />
    )}
    </>
  );
}
