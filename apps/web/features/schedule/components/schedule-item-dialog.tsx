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
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { toSearchableOptions } from "@/lib/searchable-options";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PROGRESS_DIMENSION_HINTS,
  ScheduleHint,
  ScheduleProgressDimensions,
} from "./schedule-progress-dimensions";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { ScheduleProcurementChips } from "./schedule-procurement-chips";
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
import {
  STATUS_LABELS,
  MILESTONE_COLOR,
} from "../adapters/schedule-view-types";
import { formatDateAr } from "@/lib/gantt-date-format";
import { formatMoneyAmount, formatRatePctDisplay, formatRatePctFromString } from "@/lib/format-money";
import { ScheduleCancelDialog } from "./schedule-cancel-dialog";
import { ScheduleWbsPicker } from "./schedule-wbs-picker";
import { ScheduleMissingEdtBadge } from "./schedule-missing-edt-badge";
import { ScheduleReorderControls } from "./schedule-reorder-controls";
import { Badge } from "@/components/ui/badge";

type ScheduleItemAuditEntryView = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  summary: string;
};

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
  const isContainer = item ? !item.isLeaf : false;
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

  const depNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of workspace.treeItems) map.set(row.id, row.name);
    for (const row of allItems) map.set(row.id, row.name);
    return map;
  }, [workspace.treeItems, allItems]);

  const m = item?.metrics;
  const linkedIds = item?.wbsLinks.map((l) => l.wbsNodeId) ?? [];
  const predItems = (item?.predecessorDependencies ?? []).map((d) => ({
    dependencyId: d.dependencyId,
    predecessorId: d.predecessorId,
    name: depNameById.get(d.predecessorId) ?? "Ítem",
  }));
  const succItems = (item?.successorIds ?? []).map((id) => ({
    id,
    name: depNameById.get(id) ?? "Ítem",
  }));

  const depCandidates = useMemo(() => {
    if (!item) return [];
    const source =
      workspace.treeItems.length > 0
        ? workspace.treeItems
        : allItems.map((i) => ({ id: i.id, name: i.name }));
    return source.filter(
      (i) => i.id !== item.id && !item.predecessorIds.includes(i.id),
    );
  }, [allItems, item, workspace.treeItems]);

  const predecessorOptions = useMemo(
    () => toSearchableOptions(depCandidates.map((c) => ({ id: c.id, label: c.name }))),
    [depCandidates],
  );

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
        toast.success(
          `Cronograma actualizado al ${formatRatePctFromString(pct)}% (libro de obra)`,
        );
        router.refresh();
      }
    });
  }

  function saveProgress() {
    const pct = Number(progressInput);
    if (!progressInput.trim() || Number.isNaN(pct) || pct < 0 || pct > 100) {
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
    if (!name) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
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
    const isMilestone = item.type === "MILESTONE";
    const day = startDateInput || endDateInput || null;
    startTransition(async () => {
      const res = await updateScheduleItemDatesAction(projectId, item.id, {
        startDate: isMilestone ? day : startDateInput || null,
        endDate: isMilestone ? day : endDateInput || null,
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
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="min-w-0 truncate" title={item?.name ?? "Tarea"}>
              {item?.name ?? "Tarea"}
            </span>
            {item?.type === "MILESTONE" ? (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px]"
                style={{ borderColor: `${MILESTONE_COLOR}88`, color: MILESTONE_COLOR }}
              >
                Hito
              </Badge>
            ) : null}
            {item ? <ScheduleMissingEdtBadge item={item} className="shrink-0" /> : null}
          </DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                {STATUS_LABELS[item.status] ?? item.status}
                {item.daysLate != null ? ` · Atrasado ${item.daysLate} días` : ""}
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
          <TooltipProvider delayDuration={200}>
          <div className="mt-4 space-y-4 text-sm">
            <section className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Nombre</Label>
                {workspace.canEdit ? (
                  <ScheduleReorderControls
                    projectId={projectId}
                    itemId={item.id}
                    items={allItems}
                    treeItems={workspace.treeItems}
                    size="xs"
                    layout="menu"
                  />
                ) : null}
              </div>
              {workspace.canEdit ? (
                <form
                  key={`${item.id}:${item.name}`}
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
              ) : (
                <p className="truncate" title={item.name}>{item.name}</p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-1">
                <h3 className="font-medium">Planificación</h3>
                {isContainer ? (
                  <ScheduleHint hint="Fechas calculadas desde las subtareas. El avance real se carga en las hojas, no en el contenedor." />
                ) : item.type === "MILESTONE" ? (
                  <ScheduleHint hint="En hitos el % no viene del libro; también se completa al confirmar una recepción de la misma EDT." />
                ) : null}
              </div>
              {workspace.canEdit && !isContainer ? (
                item.type === "MILESTONE" ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[10rem] flex-1 space-y-1">
                      <Label className="text-xs">Fecha del hito</Label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={startDateInput || endDateInput}
                        onChange={(e) => {
                          setStartDateInput(e.target.value);
                          setEndDateInput(e.target.value);
                        }}
                      />
                    </div>
                    <Button size="sm" disabled={pending} onClick={saveDates}>
                      Guardar
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
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
                    <Button size="sm" disabled={pending} onClick={saveDates}>
                      Guardar
                    </Button>
                  </div>
                )
              ) : (
                <p>
                  {item.type === "MILESTONE"
                    ? formatDateAr(item.endDate ?? item.startDate)
                    : `${formatDateAr(item.startDate)} → ${formatDateAr(item.endDate)}`}
                </p>
              )}
              {item.blockReason && (
                <p className="text-destructive">Bloqueo: {item.blockReason}</p>
              )}
              {workspace.canEdit && !isContainer && (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">
                        {item.type === "MILESTONE" ? "Avance % (manual)" : "Avance real %"}
                      </Label>
                      <ScheduleHint hint={PROGRESS_DIMENSION_HINTS.real.hint} />
                    </div>
                    <DecimalInput
                      value={progressInput}
                      onValueChange={setProgressInput}
                      placeholder="0,00"
                    />
                  </div>
                  <Button size="sm" disabled={pending} onClick={saveProgress}>
                    Guardar
                  </Button>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-1">
                <h3 className="font-medium">EDT enlazado</h3>
                <ScheduleHint
                  hint={
                    item.type === "MILESTONE"
                      ? "El vínculo alimenta costos/certificados y permite completar el hito al confirmar una recepción. Los hitos no sincronizan % Real desde el libro."
                      : "La partida primaria sincroniza el avance Real al aprobar el libro y alimenta costos/certificados."
                  }
                />
                <ScheduleMissingEdtBadge item={item} className="ml-auto" />
              </div>
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
                        <div className="mt-0.5 flex flex-wrap gap-2">
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
                      {workspace.canEdit && !isContainer && (
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
                      {workspace.canEdit && isContainer && (
                        <p className="max-w-[9rem] shrink-0 text-right text-[10px] text-muted-foreground">
                          EDT solo en hojas
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {workspace.canEdit && !isContainer && (
                <div className="flex items-end gap-2 pt-1">
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

            <section className="space-y-2">
              <div className="flex items-center gap-1">
                <h3 className="font-medium">Avance</h3>
                <ScheduleHint hint="Pasá el mouse por cada valor. En el Gantt: relleno oscuro = Real, borde ámbar = Cert., barra roja = atrasado." />
              </div>
              <ScheduleProgressDimensions item={item} />
              <ScheduleProcurementChips item={item} />
            </section>

            {m && (
              <section className="space-y-2">
                <div className="flex items-center gap-1">
                  <h3 className="font-medium">Presupuesto vs real</h3>
                  <ScheduleHint hint="Comprometido: OC confirmadas y subcontratos (solo lectura). Certificado ($): certificaciones emitidas." />
                </div>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
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
                <div className="space-y-1 pt-1">
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

            <div className="flex flex-wrap gap-2">
              {workspace.canEdit && !isContainer && item.type !== "MILESTONE" && m?.operationalProgressPct && (
                <Button size="sm" variant="secondary" disabled={pending} onClick={copyPhysical}>
                  Copiar avance por cantidad
                </Button>
              )}
              {workspace.canEdit && !isContainer && item.type !== "MILESTONE" && context?.jobsitePhysicalPctCumulative && (
                <Button size="sm" variant="secondary" disabled={pending} onClick={copyJobsitePhysicalPct}>
                  Copiar % físico ({context.jobsitePhysicalPctCumulative}%)
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
          </div>
          </TooltipProvider>
        )}

        {item && tab === "deps" && (
          <div className="space-y-4 text-sm mt-4">
            <section className="space-y-2">
              <h3 className="font-medium">Dependencias Finish-to-Start (FS)</h3>
              <p className="text-xs text-muted-foreground">
                Finish-to-Start. Las violaciones se guardan con advertencia. En el Gantt las flechas son de solo lectura.
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
                  ? `${formatRatePctDisplay(context.jobsitePhysicalPctCumulative)} / 100`
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
                        {j.physicalPct != null ? `${formatRatePctDisplay(j.physicalPct)}%` : "—"}
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
