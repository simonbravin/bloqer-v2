"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchableCombobox, toSearchableOptions } from "@/components/ui/searchable-combobox";
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listScheduleLinkableWbsOptionsAction(projectId).then((res) => {
      if (cancelled) return;
      if ("options" in res) setOptions(res.options);
      else setOptions([]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
      {label ? <Label className="text-xs">{label}</Label> : null}
      <SearchableCombobox
        className="h-8 text-xs"
        options={searchable}
        value={value}
        onValueChange={onValueChange}
        placeholder={loading ? "Cargando EDT…" : placeholder}
        searchPlaceholder="Buscar por código o nombre…"
        disabled={disabled || loading || filtered.length === 0}
        allowClear
      />
      {!loading && filtered.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No hay partidas hoja en el presupuesto base del cronograma.
        </p>
      )}
    </div>
  );
}
