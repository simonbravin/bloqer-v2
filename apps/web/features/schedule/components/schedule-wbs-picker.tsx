"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { toSearchableOptions } from "@/lib/searchable-options";
import { Label } from "@/components/ui/label";
import { listScheduleLinkableWbsOptionsAction } from "../actions/schedule-actions";

export type ScheduleWbsOption = { id: string; code: string; name: string };

export function ScheduleWbsPicker({
  projectId,
  value,
  onValueChange,
  disabled = false,
  label = "Partida EDT (opcional)",
  placeholder = "Buscar partida EDT…",
  excludeIds = [],
}: {
  projectId: string;
  value: string;
  onValueChange: (wbsNodeId: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  excludeIds?: string[];
}) {
  const [options, setOptions] = useState<ScheduleWbsOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOptions([]);
    void listScheduleLinkableWbsOptionsAction(projectId).then((res) => {
      if (cancelled) return;
      if ("options" in res) setOptions(res.options);
      else setError(res.error);
    }).catch(() => {
      if (!cancelled) setError("No se pudieron cargar las partidas EDT.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  const filtered = useMemo(
    () => options.filter((o) => !excludeIds.includes(o.id)),
    [options, excludeIds],
  );

  const searchable = useMemo(
    () =>
      toSearchableOptions(
        filtered.map((o) => ({ id: o.id, label: `${o.code} — ${o.name}` })),
      ),
    [filtered],
  );

  return (
    <div className="space-y-1">
      {label ? <Label htmlFor={inputId} className="text-xs">{label}</Label> : null}
      <SearchableCombobox
        id={inputId}
        aria-label={label || placeholder}
        className="h-8 text-xs"
        options={searchable}
        value={value}
        onValueChange={onValueChange}
        placeholder={loading ? "Cargando EDT…" : placeholder}
        searchPlaceholder="Buscar por código o nombre…"
        disabled={disabled || loading || filtered.length === 0}
        allowClear
      />
      {error ? <div role="alert" className="text-xs text-destructive"><p>{error}</p><Button type="button" variant="link" size="sm" disabled={disabled || loading} onClick={() => setAttempt((value) => value + 1)}>Reintentar carga de EDT</Button></div> : null}
      {!loading && !error && filtered.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No hay partidas hoja en el presupuesto base del cronograma.
        </p>
      )}
    </div>
  );
}
