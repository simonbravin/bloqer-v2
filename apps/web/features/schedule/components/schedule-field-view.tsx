"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ScheduleWorkspaceDto, ScheduleWorkspaceItemDto } from "@bloqer/services";
import {
  SCHEDULE_FIELD_LIST_LIMIT,
  filterAndSortScheduleFieldItems,
  parseScheduleFieldFilter,
  scheduleFieldWindow,
  summarizeScheduleFieldKpis,
  type ScheduleFieldFilterId,
} from "@bloqer/services/schedule-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ScheduleFieldTaskCard } from "./schedule-field-task-card";

const CHIPS: { id: ScheduleFieldFilterId; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Esta semana" },
  { id: "delayed", label: "Atrasadas" },
  { id: "in_progress", label: "En curso" },
  { id: "blocked", label: "Bloqueadas" },
  { id: "completed", label: "Completadas" },
  { id: "all", label: "Todas" },
];

const EMPTY: Record<ScheduleFieldFilterId, string> = {
  today: "No hay tareas programadas para hoy.",
  week: "No hay tareas en esta semana.",
  delayed: "No hay tareas atrasadas.",
  in_progress: "No hay tareas en curso.",
  blocked: "No hay tareas bloqueadas.",
  completed: "No hay tareas completadas.",
  all: "No hay tareas en el cronograma.",
};

export function ScheduleFieldView({
  workspace,
  fieldParam,
  searchQuery,
  onSearchQueryChange,
  onSelect,
  onFilterChange,
  queryMs,
}: {
  workspace: ScheduleWorkspaceDto;
  fieldParam: string | null;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelect: (item: ScheduleWorkspaceItemDto) => void;
  onFilterChange: (filter: ScheduleFieldFilterId) => void;
  queryMs?: number;
}) {
  const filter = parseScheduleFieldFilter(fieldParam) ?? "today";
  const window = useMemo(() => scheduleFieldWindow(), []);
  const kpis = useMemo(() => summarizeScheduleFieldKpis(workspace.items), [workspace.items]);
  const delayedKpi = workspace.summary.delayedItems;
  const items = useMemo(
    () => filterAndSortScheduleFieldItems(workspace.items, filter, window, searchQuery),
    [workspace.items, filter, window, searchQuery],
  );
  const visible = items.slice(0, SCHEDULE_FIELD_LIST_LIMIT);
  const truncated = items.length > visible.length;

  return (
    <div className="space-y-4" data-testid="schedule-field-view" data-query-ms={queryMs}>
      <div className="grid grid-cols-4 gap-2" data-testid="schedule-field-kpis">
        <FieldKpi
          label="En curso"
          value={kpis.inProgress}
          active={filter === "in_progress"}
          onClick={() => onFilterChange("in_progress")}
        />
        <FieldKpi
          label="Atrasadas"
          value={delayedKpi}
          tone={delayedKpi > 0 ? "danger" : undefined}
          active={filter === "delayed"}
          onClick={() => onFilterChange("delayed")}
        />
        <FieldKpi
          label="Bloqueadas"
          value={kpis.blocked}
          tone={kpis.blocked > 0 ? "danger" : undefined}
          active={filter === "blocked"}
          onClick={() => onFilterChange("blocked")}
        />
        <FieldKpi
          label="Completadas"
          value={kpis.completed}
          active={filter === "completed"}
          onClick={() => onFilterChange("completed")}
        />
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="schedule-field-chips"
      >
        {CHIPS.map((chip) => (
          <Button
            key={chip.id}
            type="button"
            size="sm"
            variant={filter === chip.id ? "default" : "outline"}
            className="min-h-11 shrink-0"
            data-testid={`schedule-field-chip-${chip.id}`}
            aria-pressed={filter === chip.id}
            onClick={() => onFilterChange(chip.id)}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      <Input
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="Buscar tarea"
        aria-label="Buscar tarea"
        className="min-h-11"
        data-testid="schedule-field-search"
      />

      {visible.length === 0 ? (
        <div
          className="rounded-lg border bg-card px-4 py-6 text-center"
          data-testid="schedule-field-empty"
        >
          <p className="text-sm text-muted-foreground">{EMPTY[filter]}</p>
          {filter !== "week" ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              onClick={() => onFilterChange("week")}
            >
              Ver esta semana
            </Button>
          ) : (
            <Button asChild variant="outline" className="mt-4 min-h-11">
              <Link href={`/proyectos/${workspace.projectId}`}>Volver a la obra</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <li key={item.id}>
              <ScheduleFieldTaskCard item={item} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}

      {truncated ? (
        <p className="text-xs text-muted-foreground">
          Mostrando {visible.length} de {items.length} tareas. Acotá con filtros o búsqueda.
        </p>
      ) : null}
    </div>
  );
}

export function ScheduleFieldViewSkeleton() {
  return (
    <div className="space-y-4" data-testid="schedule-field-skeleton">
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  );
}

function FieldKpi({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "danger";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-1 py-2 text-center min-h-11",
        active && "border-primary",
      )}
    >
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
    </button>
  );
}
